import { Inject, Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ENV, type Env } from '../../env.js'
import { AGENT_CONFIG, type AgentConfig } from '../agent-config.js'
import { ConversationService } from '../conversation.service.js'
import { EngineError, type EngineEvent, type EngineInput, type SessionFactory } from '../engine.js'
import { makePatch } from './patch.js'
import { restartDelay } from './backoff.js'
import { mapNotification } from './map.js'
@Injectable()
export class DshRuntime implements OnModuleInit, OnModuleDestroy, SessionFactory {
  ready = false
  private harness?: DeepSeekHarness
  private stopped = false
  private restarting?: Promise<void>
  private generation = 0
  private loaded = new Set<string>()
  private fresh = new Set<string>()
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private wake?: () => void
  constructor(@Inject(ENV) private readonly env: Env,
    @Inject(AGENT_CONFIG) private readonly config: AgentConfig,
    private readonly conversations: ConversationService) {}
  onExit(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  async onModuleInit(): Promise<void> {
    if (this.env.AGENT_ENGINE === 'fake') return
    // 启动失败进入503状态，由退避重试恢复；不阻塞公网健康检查启动。
    void this.restart().catch(() => { /* stopped or teardown failed: remain unavailable */ })
  }
  createSessionId(): string {
    const id = randomUUID()
    this.fresh.add(id)
    return id
  }

  private async boot(): Promise<void> {
    const mode = this.env.AGENT_ENGINE
    if (mode === 'fake') return
    const patch = resolve('var/should-quit.generated.cordis.yml'), cwd = resolve('var/agent-workspace')
    await mkdir(dirname(patch), { recursive: true }); await mkdir(cwd, { recursive: true })
    await writeFile(patch, JSON.stringify(makePatch(this.config.prompt, mode, patch)), 'utf8')
    const h = new DeepSeekHarness({ profile: 'sdk', patches: [patch],
      // 防止子进程读取后端 .env，配置仅通过白名单传递。
      dshHome: resolve(this.env.DSH_HOME_DIR), cwd, processCwd: cwd,
      provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 2048,
      initializeTimeoutMs: 60_000, requestTimeoutMs: 660_000,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '',
        DEEPSEEK_API_KEY: this.env.DEEPSEEK_API_KEY!,
        INTERNAL_URL: `http://127.0.0.1:${this.env.INTERNAL_PORT}`,
        INTERNAL_TOKEN: this.env.INTERNAL_TOKEN } })
    this.harness = h
    await h.start()
    if (this.stopped) { await h.close(); return }
    this.ready = true
    const generation = this.generation
    const subscription = h.client.subscribe()
    void (async () => {
      try { for await (const _ of subscription) { /* drain without logging content */ } }
      catch {
        if (!this.stopped && generation === this.generation) void this.restart().catch(() => {})
      } finally { subscription.close() }
    })()
  }
  restart(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.restarting) return this.restarting
    this.ready = false
    this.restarting = this.recover().finally(() => { this.restarting = undefined })
    return this.restarting
  }
  private async recover(): Promise<void> {
    this.generation++
    for (let attempt = 0; !this.stopped; attempt++) {
      try {
        const previous = this.harness
        await previous?.close()
        this.harness = undefined
        this.loaded.clear(); this.fresh.clear()
        if (previous) for (const listener of this.listeners) listener()
        if (previous && attempt === 0) {
          await new Promise<void>(done => {
            this.wake = done
            this.timer = setTimeout(done, restartDelay(0))
          })
          this.timer = undefined; this.wake = undefined
        }
        if (this.stopped) return
        await this.boot()
        return
      } catch {
        this.ready = false
        await new Promise<void>(done => {
          this.wake = done
          this.timer = setTimeout(done, restartDelay(attempt))
        })
        this.timer = undefined; this.wake = undefined
      }
    }
  }
  async run(p: EngineInput, emit: (e: EngineEvent) => void): Promise<void> {
    if (!this.ready || !this.harness) throw new EngineError('AGENT_UNAVAILABLE', '智能体暂不可用', true)
    const h = this.harness, generation = this.generation
    let sessionId = p.dshSessionId, prefix = ''
    if (!this.loaded.has(sessionId) && !this.fresh.has(sessionId)) {
      try { await h.resumeSession(sessionId) }
      catch {
        if (!this.ready || generation !== this.generation) throw new EngineError('AGENT_UNAVAILABLE', '智能体已断开', true)
        const history = await this.conversations.messages(p.userId, p.conversationId)
        {
          const nextId = h.session().id
          await this.conversations.replaceSession(p.conversationId, sessionId, nextId)
          sessionId = nextId
          prefix = await this.conversations.history(p.userId, p.conversationId, history.findLast(m => m.role === 'USER')?.id) + '\n'
        }
      }
    }
    if (!this.ready || generation !== this.generation) throw new EngineError('AGENT_UNAVAILABLE', '智能体已断开', true)
    this.loaded.add(sessionId); this.fresh.delete(sessionId)
    let receivedText = false
    try {
      const result = await h.session(sessionId).run(prefix + p.text, { onNotification: n => {
        if (generation !== this.generation) return
        const event = mapNotification(n, sessionId, this.config)
        if (event?.type === 'delta') receivedText = true
        if (event) emit(event)
      } })
      if (generation !== this.generation) throw new EngineError('AGENT_UNAVAILABLE', '智能体已重启', true)
      if (!receivedText && result.finalResponse) emit({ type: 'delta', text: result.finalResponse })
    } catch (e) {
      if (e instanceof EngineError) throw e
      throw new EngineError('AGENT_UNAVAILABLE', '智能体暂不可用，请稍后重试', generation !== this.generation || !this.ready)
    }
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true; this.ready = false; this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.wake?.()
    await this.harness?.close()
    await this.restarting
  }
}

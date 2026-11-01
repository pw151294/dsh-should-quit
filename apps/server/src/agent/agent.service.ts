// apps/server/src/agent/agent.service.ts
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import type { Response } from 'express'
import { formatAgentEvent, SSE_PING, type AgentEvent } from '@should-quit/shared'
import { PrismaService } from '../prisma/prisma.service.js'
import { Clock } from '../clock.js'
import { ENV, type Env } from '../env.js'
import { AppError } from '../common/app-error.js'
import { ConversationService } from './conversation.service.js'
import { AGENT_ENGINE, EngineError, type AgentEngine } from './engine.js'
import { RateLimiter } from './rate-limiter.js'
import { DshRuntime } from './dsh/dsh-runtime.js'
type Status = 'COMPLETE' | 'FAILED' | 'INTERRUPTED'
interface Turn { exit(): void; settled: Promise<void> }
@Injectable()
export class AgentService implements OnModuleDestroy {
  private readonly locks = new Map<string, Turn>()
  private stopping = false
  private readonly pending = new Map<Turn, Promise<void>>()
  private readonly limiter = new RateLimiter()
  private readonly unsubscribe: () => void
  constructor(private readonly db: PrismaService, private readonly clock: Clock,
    private readonly conversations: ConversationService,
    @Inject(AGENT_ENGINE) private readonly engine: AgentEngine,
    @Inject(ENV) private readonly env: Env, private readonly runtime: DshRuntime) {
    this.unsubscribe = runtime.onExit(() => { for (const turn of this.locks.values()) turn.exit() })
  }
  async ask(userId: string, id: string, text: string, res: Response): Promise<void> {
    const conversation = await this.conversations.owned(userId, id)
    if (this.stopping) throw new AppError('AGENT_RESTARTING', '服务关闭中')
    if (this.env.AGENT_ENGINE !== 'fake' && !this.runtime.ready) throw new AppError('AGENT_RESTARTING', '智能体启动中')
    if (this.locks.has(id)) throw new AppError('AGENT_BUSY', '上一条回答还在后台收尾，稍等片刻再试，或新开一个会话')
    if (!this.limiter.take(userId, this.clock.now().getTime())) throw new AppError('RATE_LIMITED', '每小时最多提问30次')
    let release!: () => void
    const settled = new Promise<void>(resolve => { release = resolve })
    // 占锁发生在任何后续await之前。
    let exited = false
    let exit = () => { exited = true }
    const turn: Turn = { exit: () => exit(), settled }
    let durable!: () => void
    const persisted = new Promise<void>(resolve => { durable = resolve })
    this.pending.set(turn, persisted)
    this.locks.set(id, turn)
    try {
      const at = this.clock.now()
      await this.db.$transaction([
        this.db.agentMessage.create({ data: { conversationId: id, role: 'USER', status: 'COMPLETE', content: text, createdAt: at } }),
        this.db.agentConversation.update({ where: { id }, data: {
          lastMessageAt: at, ...(conversation.title === null ? { title: Array.from(text).slice(0, 20).join('') } : {}),
        } }),
      ])
    } catch (e) { if (this.locks.get(id) === turn) this.locks.delete(id); release(); durable(); this.pending.delete(turn); throw new AppError('AGENT_UNAVAILABLE', '消息保存失败') }
    let connected = true, content = '', lastWrite = Date.now(), terminal: Promise<void> | undefined
    let timedOut = false, processGone = false
    let ping: ReturnType<typeof setInterval> | undefined
    const closeSocket = () => { connected = false; if (ping) clearInterval(ping) }
    const write = (frame: string) => {
      if (!connected || res.writableEnded || res.destroyed) return
      try { res.write(frame); lastWrite = Date.now() } catch { closeSocket() }
    }
    res.on('close', closeSocket)
    try { res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.flushHeaders() } catch {
      connected = false
      // headers写入失败仍继续底层一轮，后续终态照常落库。
    }
    const finish = (status: Status, error?: Extract<AgentEvent, { type: 'error' }>): Promise<void> => {
      if (terminal) return terminal
      // Promise先赋值，保证timeout/run/exit竞争只能创建一条assistant。
      const savedContent = content
      terminal = Promise.resolve().then(async () => {
        try {
          const message = await this.db.agentMessage.create({ data: {
            conversationId: id, role: 'ASSISTANT', status, content: savedContent, createdAt: this.clock.now(),
          } })
          write(formatAgentEvent(error ?? { type: 'done', messageId: message.id }))
        } catch {
          write(formatAgentEvent({ type: 'error', code: 'AGENT_UNAVAILABLE', message: '回答保存失败，请稍后查看历史' }))
        } finally {
          if (ping) clearInterval(ping)
          if (connected && !res.writableEnded) { try { res.end() } catch { closeSocket() } }
          closeSocket()
          res.off('close', closeSocket)
          durable()
          this.pending.delete(turn)
        }
      })
      return terminal
    }
    exit = () => {
      processGone = true
      clearTimeout(timeout); clearTimeout(kill)
      if (ping) clearInterval(ping)
      res.off('close', closeSocket)
      void finish('INTERRUPTED', { type: 'error', code: 'AGENT_UNAVAILABLE', message: '智能体已断开，请重试' })
      if (this.locks.get(id) === turn) this.locks.delete(id)
    }
    ping = setInterval(() => { if (Date.now() - lastWrite >= 15_000) write(SSE_PING) }, 15_000)
    const timeout = setTimeout(() => {
      timedOut = true
      void finish('INTERRUPTED', { type: 'error', code: 'AGENT_TIMEOUT', message: '回答超时，请稍后重试' })
    }, 300_000)
    const kill = setTimeout(() => {
      void this.runtime.restart().catch(() => {})
      // fake单测通过注入runtime.restart模拟进程退出；不提前解锁。
    }, 600_000)
    if (exited) exit()
    const run = async () => {
      try {
        if (processGone) return
        for await (const event of this.engine.ask({ userId, conversationId: id,
          dshSessionId: conversation.dshSessionId, text })) {
          if (terminal || timedOut || processGone) continue
          if (event.type === 'delta') content += event.text
          write(formatAgentEvent(event))
        }
        await finish('COMPLETE')
      } catch (e) {
        const interrupted = processGone || (e instanceof EngineError && e.interrupted)
        await finish(interrupted ? 'INTERRUPTED' : 'FAILED', {
          type: 'error', code: 'AGENT_UNAVAILABLE', message: '智能体暂不可用，请稍后重试',
        })
      } finally {
        clearTimeout(timeout); clearTimeout(kill)
        if (ping) clearInterval(ping)
        res.off('close', closeSocket)
        if (this.locks.get(id) === turn) this.locks.delete(id)
        release()
      }
    }
    // HTTP控制器立即返回；后台Promise始终被观察，不随socket结束而iterator.return。
    void run().catch(() => {})
  }
  async shutdown(): Promise<void> {
    this.stopping = true
    const pending = [...this.pending.entries()]
    const turns = new Set([...this.locks.values(), ...pending.map(([turn]) => turn)])
    for (const turn of turns) turn.exit()
    await Promise.all(pending.map(([, persisted]) => persisted))
  }
  async onModuleDestroy(): Promise<void> {
    this.unsubscribe()
    await this.shutdown()
  }
}

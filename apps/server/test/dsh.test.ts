import { expect, it } from 'vitest'
import { makePatch, FORBIDDEN_ROWS } from '../src/agent/dsh/patch.js'
import { restartDelay } from '../src/agent/dsh/backoff.js'
it('both modes disable every built-in tool and replace complete prompt config', () => {
  for (const mode of ['dsh-tools', 'dsh-context'] as const) {
    const patch = makePatch('热线已注入', mode, '/repo/apps/server/var/generated.cordis.yml')
    for (const id of FORBIDDEN_ROWS) expect(patch).toContainEqual({ id, disabled: true })
    expect(patch).not.toContainEqual({ id: 'bash-sandbox', disabled: true })
    expect(patch.filter(row => 'insert' in row)).toHaveLength(mode === 'dsh-tools' ? 1 : 0)
    expect(patch).toContainEqual({ id: 'system-prompt', config: {
      includeHarnessIdentity: false, personaPrefix: '热线已注入', personaSuffix: '',
    } })
  }
  expect([0, 1, 2, 3, 4, 5, 20].map(restartDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
})

import { vi } from 'vitest'
import { mapNotification } from '../src/agent/dsh/map.js'
import { DshToolsEngine, DshContextEngine } from '../src/agent/dsh/dsh.engine.js'
import type { AgentContext } from '../src/agent-tools/context.js'
it('maps only this session text and business tools', () => {
  const config = { toolLabels: { get_score_summary: 'score' } } as never
  const n = { method: 'session.event', params: { sessionId: 'a', event: {
    type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'hello' }] } },
  } } }
  expect(mapNotification(n as never, 'b', config)).toBeNull()
  expect(mapNotification(n as never, 'a', config)).toEqual({ type: 'delta', text: 'hello' })
})
it.each(['tools', 'context'])('runs %s engine and forwards failures', async mode => {
  const run = vi.fn(async (_p, emit) => { emit({ type: 'delta', text: 'answer' }) })
  const runtime = { run } as unknown as DshRuntime
  const buildContext = vi.fn(async () => 'authoritative context')
  const engine = mode === 'tools' ? new DshToolsEngine(runtime)
    : new DshContextEngine(runtime, { buildContext } as unknown as AgentContext)
  const input = { userId: 'u', conversationId: 'c', dshSessionId: 'a', text: 'question' }
  expect(await collect(engine.ask(input))).toEqual([{ type: 'delta', text: 'answer' }])
  expect(run.mock.calls[0]![0].text).toContain(mode === 'tools' ? 'question' : 'authoritative context')
  run.mockRejectedValueOnce(new Error('failed'))
  await expect(collect(engine.ask(input))).rejects.toThrow('failed')
})

vi.mock('@deepseek-ai/dsh-sdk-client', () => ({ DeepSeekHarness: vi.fn() }))
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { DshRuntime } from '../src/agent/dsh/dsh-runtime.js'
it('isolates simultaneous sessions, resumes once and avoids duplicate final text', async () => {
  const session = vi.fn((id: string) => ({ id, run: vi.fn(async (_text, options) => {
    options.onNotification({ method: 'session.event', params: { sessionId: id === 'a' ? 'b' : 'a',
      event: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'wrong' }] } } } } })
    options.onNotification({ method: 'session.event', params: { sessionId: id,
      event: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: id }] } } } } })
    return { finalResponse: id }
  }) }))
  const h = { session, resumeSession: vi.fn(), close: vi.fn() }
  const runtime = new DshRuntime({} as never, { toolLabels: {} } as never, {} as never)
  Object.assign(runtime, { harness: h, ready: true })
  const a: unknown[] = [], b: unknown[] = []
  const input = { userId: 'u', conversationId: 'c', dshSessionId: 'a', text: 'q' }
  await Promise.all([runtime.run(input, e => a.push(e)), runtime.run({ ...input, dshSessionId: 'b' }, e => b.push(e))])
  expect(a).toEqual([{ type: 'delta', text: 'a' }]); expect(b).toEqual([{ type: 'delta', text: 'b' }])
  await runtime.run(input, () => {})
  expect(h.resumeSession).toHaveBeenCalledTimes(2)
  await runtime.onModuleDestroy()
  await runtime.restart()
  expect(DeepSeekHarness).not.toHaveBeenCalled()
})

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> { const result: T[] = []; for await (const item of source) result.push(item); return result }
it('retains a live harness on close failure, retries once and notifies only after closure', async () => {
  vi.useFakeTimers()
  try {
    const close = vi.fn().mockRejectedValueOnce(new Error('still live')).mockResolvedValue(undefined)
    const runtime = new DshRuntime({} as never, {} as never, {} as never)
    const boot = vi.fn(async () => { runtime.ready = true })
    Object.assign(runtime, { harness: { close }, ready: true, boot })
    const exit = vi.fn(); runtime.onExit(exit)
    const first = runtime.restart()
    expect(runtime.restart()).toBe(first)
    await Promise.resolve(); await Promise.resolve()
    expect(exit).not.toHaveBeenCalled(); expect(boot).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    await first
    expect(close).toHaveBeenCalledTimes(2); expect(exit).toHaveBeenCalledTimes(1)
    expect(boot).toHaveBeenCalledTimes(1)
    await runtime.onModuleDestroy()
  } finally { vi.useRealTimers() }
})
it('rebuild excludes the persisted current user message and replaces the stale session', async () => {
  const run = vi.fn(async () => ({ finalResponse: 'fallback' }))
  const h = { resumeSession: vi.fn().mockRejectedValue(new Error('missing')), session: vi.fn((id?: string) => ({ id: id ?? 'new', run })) }
  const conversations = { messages: vi.fn(async () => [{ id: 'current', role: 'USER' }]),
    replaceSession: vi.fn(), history: vi.fn(async () => 'history') }
  const runtime = new DshRuntime({} as never, {} as never, conversations as never)
  Object.assign(runtime, { harness: h, ready: true })
  const emit = vi.fn()
  await runtime.run({ userId: 'u', conversationId: 'c', dshSessionId: 'old', text: 'question' }, emit)
  expect(conversations.history).toHaveBeenCalledWith('u', 'c', 'current')
  expect(conversations.replaceSession).toHaveBeenCalledWith('c', 'old', 'new')
  expect(run.mock.calls[0]).toEqual(['history\nquestion', expect.any(Object)])
  expect(emit).toHaveBeenCalledExactlyOnceWith({ type: 'delta', text: 'fallback' })
})

it('waits one second after confirmed transport exit and cancels replacement on shutdown', async () => {
  vi.useFakeTimers()
  try {
    let exit!: (error: Error) => void
    const next = new Promise<never>((_resolve, reject) => { exit = reject })
    const close = vi.fn(async () => {})
    const harness = { start: vi.fn(async () => {}), close, client: { subscribe: () => ({
      [Symbol.asyncIterator]: () => ({ next: () => next }), close: vi.fn(),
    }) } }
    vi.mocked(DeepSeekHarness).mockImplementation(function () { return harness as never })
    const runtime = new DshRuntime({ AGENT_ENGINE: 'dsh-tools', DSH_HOME_DIR: 'var/test-dsh',
      INTERNAL_PORT: 3100, INTERNAL_TOKEN: 'test', DEEPSEEK_API_KEY: 'test' } as never,
      { prompt: 'test', toolLabels: {} } as never, {} as never)
    await runtime.restart()
    expect(harness.start).toHaveBeenCalledTimes(1)
    exit(new Error('transport exited'))
    await vi.advanceTimersByTimeAsync(0)
    expect(close).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(harness.start).toHaveBeenCalledTimes(1)
    const replacement = vi.fn(async () => {})
    Object.assign(runtime, { boot: replacement })
    await vi.advanceTimersByTimeAsync(1)
    expect(replacement).toHaveBeenCalledTimes(1)
    Object.assign(runtime, { harness })
    const pending = runtime.restart()
    await vi.advanceTimersByTimeAsync(0)
    await runtime.onModuleDestroy()
    await pending
    await vi.advanceTimersByTimeAsync(1000)
    expect(replacement).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers(); vi.mocked(DeepSeekHarness).mockReset() }
})

it('starts the child in the isolated workspace without loading the server dotenv', async () => {
  const harness = { start: vi.fn(async () => {}), close: vi.fn(async () => {}),
    client: { subscribe: () => ({
      [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }), close: vi.fn(),
    }) } }
  vi.mocked(DeepSeekHarness).mockImplementation(function () { return harness as never })
  const runtime = new DshRuntime({ AGENT_ENGINE: 'dsh-tools', DSH_HOME_DIR: 'var/test-dsh',
    INTERNAL_PORT: 3100, INTERNAL_TOKEN: 'test', DEEPSEEK_API_KEY: 'test' } as never,
    { prompt: 'test', toolLabels: {} } as never, {} as never)
  try {
    await runtime.restart()
    const options = vi.mocked(DeepSeekHarness).mock.calls.at(-1)![0]!
    expect(options.processCwd).toBe(options.cwd)
    expect(Object.keys(options.env!).sort()).toEqual([
      'DEEPSEEK_API_KEY', 'HOME', 'INTERNAL_TOKEN', 'INTERNAL_URL', 'PATH',
    ])
  } finally { await runtime.onModuleDestroy(); vi.mocked(DeepSeekHarness).mockReset() }
})

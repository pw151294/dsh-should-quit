// apps/server/test/agent.e2e.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp, loginAs, ALL3, type TestApp } from './helpers.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { FakeAgentEngine } from '../src/agent/fake.engine.js'
import { AGENT_ENGINE, EngineError } from '../src/agent/engine.js'
import { ENV, type Env } from '../src/env.js'
import { DshRuntime } from '../src/agent/dsh/dsh-runtime.js'
import { AgentService } from '../src/agent/agent.service.js'
import { EventEmitter } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import type { Response } from 'express'
class Sink extends EventEmitter {
  frames: string[] = []; writableEnded = false; destroyed = false
  status() { return this }
  set() { return this }
  flushHeaders() {}
  write(s: string) { this.frames.push(s); return true }
  end() { this.writableEnded = true }
}
let t: TestApp, db: PrismaService, fake: FakeAgentEngine
beforeAll(async () => {
  t = await createTestApp(); db = t.app.get(PrismaService)
  fake = t.app.get(AGENT_ENGINE)
})
afterAll(async () => { vi.useRealTimers(); await t.close() })
beforeEach(async () => {
  vi.useRealTimers(); fake.autoComplete = true; fake.runs.length = 0
  await db.agentMessage.deleteMany(); await db.agentConversation.deleteMany()
})
async function fixture(code: string) {
  const user = await loginAs(t, code)
  await t.http().put('/api/baseline').set('Authorization', user.authorization).send(ALL3).expect(200)
  const c = await t.http().post('/api/agent/conversations').set('Authorization', user.authorization).send({}).expect(201)
  return { ...user, id: c.body.id as string }
}
async function until(check: () => boolean) {
  const deadline = performance.now() + 5000
  while (performance.now() < deadline) {
    if (check()) return
    await delay(5)
  }
  throw new Error('condition did not settle')
}
describe('agent SSE', () => {
  it('writes complete answer before done', async () => {
    const a = await fixture('complete')
    const response = await t.http().post(`/api/agent/conversations/${a.id}/messages`)
      .set('Authorization', a.authorization).send({ text: '我该溜吗' }).expect(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.text.indexOf('event: delta')).toBeLessThan(response.text.indexOf('event: done'))
    const rows = await db.agentMessage.findMany({ where: { conversationId: a.id } })
    expect(rows.map(r => r.status)).toEqual(['COMPLETE', 'COMPLETE'])
    expect(response.text).toContain(rows.find(r => r.role === 'ASSISTANT')!.id)
  })
  it('other user gets 404 before SSE', async () => {
    const a = await fixture('owner'), b = await loginAs(t, 'intruder')
    await t.http().put('/api/baseline').set('Authorization', b.authorization).send(ALL3)
    const r = await t.http().post(`/api/agent/conversations/${a.id}/messages`)
      .set('Authorization', b.authorization).send({ text: '问' }).expect(404)
    expect(r.headers['content-type']).toContain('application/json')
  })
  it('timeout retains lock until fake settles and ignores late text', async () => {
    const a = await fixture('timeout'), service = t.app.get(AgentService)
    fake.autoComplete = false
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const sink = new Sink()
    await service.ask(a.userId, a.id, '问', sink as unknown as Response)
    fake.runs[0]!.queue.push({ type: 'delta', text: '部分' })
    await Promise.resolve(); await vi.advanceTimersByTimeAsync(15_000)
    expect(sink.frames.join('')).toContain(': ping')
    await vi.advanceTimersByTimeAsync(285_000)
    await until(() => sink.writableEnded)
    await expect(service.ask(a.userId, a.id, '再问', new Sink() as unknown as Response)).rejects.toMatchObject({ code: 'AGENT_BUSY' })
    fake.runs[0]!.queue.push({ type: 'delta', text: '迟到' }); fake.runs[0]!.queue.end()
    await until(() => !(service as unknown as { locks: Map<string, unknown> }).locks.has(a.id))
    const assistant = await db.agentMessage.findFirstOrThrow({ where: { conversationId: a.id, role: 'ASSISTANT' } })
    expect(assistant.status).toBe('INTERRUPTED'); expect(assistant.content).toBe('部分')
    expect(sink.frames.join('')).toContain('AGENT_TIMEOUT')
    expect(sink.frames.join('')).not.toContain('event: done')
    vi.useRealTimers()
  })
  it('model failure is FAILED, transport failure INTERRUPTED', async () => {
    for (const interrupted of [false, true]) {
      const a = await fixture(`failure-${interrupted}`), sink = new Sink()
      fake.autoComplete = false
      await t.app.get(AgentService).ask(a.userId, a.id, '问', sink as unknown as Response)
      fake.runs.at(-1)!.queue.fail(new EngineError('AGENT_UNAVAILABLE', '错误', interrupted))
      await until(() => sink.writableEnded)
      const m = await db.agentMessage.findFirstOrThrow({ where: { conversationId: a.id, role: 'ASSISTANT' } })
      expect(m.status).toBe(interrupted ? 'INTERRUPTED' : 'FAILED')
    }
  })
})

it('serializes a conversation while other conversations and users run', async () => {
  const a = await fixture('parallel-a'), b = await fixture('parallel-b')
  const c = await t.http().post('/api/agent/conversations').set('Authorization', a.authorization).send({}).expect(201)
  fake.autoComplete = false
  const service = t.app.get(AgentService)
  await service.ask(a.userId, a.id, '一', new Sink() as unknown as Response)
  const busy = await t.http().post(`/api/agent/conversations/${a.id}/messages`).set('Authorization', a.authorization).send({ text: '二' }).expect(409)
  expect(busy.headers['content-type']).toContain('application/json')
  await Promise.all([service.ask(a.userId, c.body.id, '三', new Sink() as unknown as Response), service.ask(b.userId, b.id, '四', new Sink() as unknown as Response)])
  expect(fake.runs).toHaveLength(3)
  for (const run of fake.runs) run.queue.end()
  await until(() => (service as unknown as { locks: Map<string, unknown> }).locks.size === 0)
})

it('limits the 31st question per user', async () => {
  const a = await fixture('rate'), service = t.app.get(AgentService)
  for (let i = 0; i < 30; i++) {
    const sink = new Sink()
    await service.ask(a.userId, a.id, '问', sink as unknown as Response)
    await until(() => sink.writableEnded)
    await until(() => !(service as unknown as { locks: Map<string, unknown> }).locks.has(a.id))
  }
  const rate = await t.http().post(`/api/agent/conversations/${a.id}/messages`).set('Authorization', a.authorization).send({ text: '问' }).expect(429)
  expect(rate.headers['content-type']).toContain('application/json')
  expect(await db.agentMessage.count({ where: { conversationId: a.id, role: 'USER' } })).toBe(30)
})

it('disconnect preserves backend completion and user is written before engine starts', async () => {
  const a = await fixture('disconnect'), service = t.app.get(AgentService), sink = new Sink()
  fake.autoComplete = false
  await service.ask(a.userId, a.id, '问', sink as unknown as Response)
  expect(await db.agentMessage.count({ where: { conversationId: a.id, role: 'USER', status: 'COMPLETE' } })).toBe(1)
  fake.runs[0]!.queue.push({ type: 'delta', text: '前' })
  fake.runs[0]!.queue.push({ type: 'tool', name: 'get_baseline', label: '读取基准' })
  await until(() => sink.frames.join('').includes('event: tool'))
  expect(sink.frames.join('').indexOf('event: delta')).toBeLessThan(sink.frames.join('').indexOf('event: tool'))
  const framesBeforeClose = sink.frames.length
  sink.emit('close')
  fake.runs[0]!.queue.push({ type: 'delta', text: '后台回答' }); fake.runs[0]!.queue.end()
  await until(() => !(service as unknown as { locks: Map<string, unknown> }).locks.has(a.id))
  const m = await db.agentMessage.findFirstOrThrow({ where: { conversationId: a.id, role: 'ASSISTANT' } })
  expect(m).toMatchObject({ content: '前后台回答', status: 'COMPLETE' })
  expect(sink.frames).toHaveLength(framesBeforeClose)
})

it('restarts at 600 seconds and confirmed exit unlocks without late overwrite', async () => {
  const a = await fixture('restart'), service = t.app.get(AgentService), runtime = t.app.get(DshRuntime)
  fake.autoComplete = false
  const restart = vi.spyOn(runtime, 'restart').mockResolvedValue()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  try {
    const sink = new Sink()
    await service.ask(a.userId, a.id, '问', sink as unknown as Response)
    await vi.advanceTimersByTimeAsync(300_000)
    await until(() => sink.writableEnded)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(restart).toHaveBeenCalledTimes(1)
    await expect(service.ask(a.userId, a.id, '再问', new Sink() as unknown as Response)).rejects.toMatchObject({ code: 'AGENT_BUSY' })
    for (const listener of (runtime as unknown as { listeners: Set<() => void> }).listeners) listener()
    const next = new Sink()
    await service.ask(a.userId, a.id, '新轮', next as unknown as Response)
    fake.runs[0]!.queue.end()
    await delay(5)
    await expect(service.ask(a.userId, a.id, '并发', new Sink() as unknown as Response)).rejects.toMatchObject({ code: 'AGENT_BUSY' })
    fake.runs[1]!.queue.end()
    await until(() => next.writableEnded)
    expect(await db.agentMessage.count({ where: { conversationId: a.id, role: 'ASSISTANT' } })).toBe(2)
    expect(sink.frames.join('').match(/event: error/g)).toHaveLength(1)
  } finally { restart.mockRestore(); vi.useRealTimers() }
})

it('returns JSON 503 before SSE when runtime is unavailable', async () => {
  const a = await fixture('unavailable'), env = t.app.get<Env>(ENV), previous = env.AGENT_ENGINE
  env.AGENT_ENGINE = 'dsh-tools'
  try {
    const r = await t.http().post(`/api/agent/conversations/${a.id}/messages`).set('Authorization', a.authorization).send({ text: '问' }).expect(503)
    expect(r.headers['content-type']).toContain('application/json')
    expect(await db.agentMessage.count({ where: { conversationId: a.id } })).toBe(0)
  } finally { env.AGENT_ENGINE = previous }
})

it('shutdown waits a deferred assistant insert without waiting engine settle', async () => {
  const a = await fixture('shutdown-insert'), service = t.app.get(AgentService)
  fake.autoComplete = false
  await service.ask(a.userId, a.id, '问', new Sink() as unknown as Response)
  let resolve!: () => void
  const gate = new Promise<void>(r => { resolve = r })
  const original = db.agentMessage.create.bind(db.agentMessage)
  const spy = vi.spyOn(db.agentMessage, 'create').mockImplementation(((args: never) => gate.then(() => original(args))) as never)
  let complete = false
  const shutdown = service.shutdown().then(() => { complete = true })
  await new Promise(r => setImmediate(r))
  expect(complete).toBe(false)
  resolve()
  await shutdown
  expect(await db.agentMessage.count({ where: { conversationId: a.id, status: 'INTERRUPTED' } })).toBe(1)
  spy.mockRestore()
  fake.runs[0]!.queue.end()
})

it('shutdown waits initialization transaction then interrupted assistant persistence', async () => {
  const isolated = await createTestApp()
  const database = isolated.app.get(PrismaService), service = isolated.app.get(AgentService)
  const user = await loginAs(isolated, 'shutdown-user-tx')
  await isolated.http().put('/api/baseline').set('Authorization', user.authorization).send(ALL3)
  const c = await isolated.http().post('/api/agent/conversations').set('Authorization', user.authorization).send({}).expect(201)
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>(r => { release = r }), started = new Promise<void>(r => { entered = r })
  const original = database.$transaction.bind(database)
  const spy = vi.spyOn(database, '$transaction').mockImplementation(((args: never) => {
    entered()
    return gate.then(() => original(args))
  }) as never)
  try {
    const ask = service.ask(user.userId, c.body.id, '问', new Sink() as unknown as Response)
    await started
    let complete = false
    const shutdown = service.shutdown().then(() => { complete = true })
    await new Promise(r => setImmediate(r))
    expect(complete).toBe(false)
    release()
    await Promise.all([ask, shutdown])
    expect(await database.agentMessage.findMany({ where: { conversationId: c.body.id }, select: { role: true, status: true }, orderBy: { createdAt: 'asc' } })).toEqual([
      { role: 'USER', status: 'COMPLETE' }, { role: 'ASSISTANT', status: 'INTERRUPTED' },
    ])
    expect(isolated.app.get<FakeAgentEngine>(AGENT_ENGINE).runs).toHaveLength(0)
  } finally { spy.mockRestore(); await isolated.close() }
})

it('shutdown clears a persisted timed-out turn without awaiting hung iterator', async () => {
  const isolated = await createTestApp()
  const user = await loginAs(isolated, 'shutdown-timeout')
  await isolated.http().put('/api/baseline').set('Authorization', user.authorization).send(ALL3)
  const c = await isolated.http().post('/api/agent/conversations').set('Authorization', user.authorization).send({}).expect(201)
  const service = isolated.app.get(AgentService), engine = isolated.app.get<FakeAgentEngine>(AGENT_ENGINE)
  engine.autoComplete = false
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  try {
    const sink = new Sink()
    await service.ask(user.userId, c.body.id, '问', sink as unknown as Response)
    await vi.advanceTimersByTimeAsync(301_000)
    await until(() => sink.writableEnded)
    expect((service as unknown as { locks: Map<string, unknown> }).locks.size).toBe(1)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await service.shutdown()
    expect((service as unknown as { locks: Map<string, unknown> }).locks.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(engine.runs).toHaveLength(1)
  } finally {
    engine.runs[0]?.queue.end()
    vi.useRealTimers()
    await isolated.close()
  }
})

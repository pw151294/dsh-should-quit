import { loadEnv } from '../src/env.js'
import { describe, expect, it } from 'vitest'
import { AsyncQueue } from '../src/agent/async-queue.js'
import { RateLimiter } from '../src/agent/rate-limiter.js'
import { FakeAgentEngine } from '../src/agent/fake.engine.js'
import { loadAgentConfig, parseAgentConfig } from '../src/agent/agent-config.js'
import { AGENT_TOOL_NAMES } from '@should-quit/shared'
describe('agent primitives', () => {
  it('30/hour, user isolation, exact expiry', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 30; i++) expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('a', 3_599_999)).toBe(false)
    expect(limiter.take('b', 0)).toBe(true)
    expect(limiter.take('a', 3_600_000)).toBe(true)
  })
  it('queue wakes and drains before terminal error', async () => {
    const q = new AsyncQueue<number>(), iterator = q[Symbol.asyncIterator]()
    const first = iterator.next()
    q.push(1)
    expect(await first).toEqual({ value: 1, done: false })
    q.push(2); q.fail(new Error('failed')); q.push(3)
    expect((await iterator.next()).value).toBe(2)
    await expect(iterator.next()).rejects.toThrow('failed')
  })
  it('fake remains active until controlled settle', async () => {
    const fake = new FakeAgentEngine(); fake.autoComplete = false
    const iterator = fake.ask({ userId: 'a', conversationId: 'c', dshSessionId: 's', text: '问' })[Symbol.asyncIterator]()
    const next = iterator.next()
    fake.runs[0]!.queue.push({ type: 'delta', text: '答' })
    expect((await next).value).toEqual({ type: 'delta', text: '答' })
    fake.runs[0]!.queue.end()
    expect((await iterator.next()).done).toBe(true)
  })
  it('validates labels and placeholders', () => {
    const raw = { hotline: '热线', presetQuestions: ['问'], toolLabels: Object.fromEntries(AGENT_TOOL_NAMES.map(n => [n, n])) }
    expect(parseAgentConfig(raw, '{{hotline}}').prompt).toBe('热线')
    expect(() => parseAgentConfig(raw, '{{hotline}} {{unknown}}')).toThrow()
    expect(() => parseAgentConfig({ ...raw, hotline: '' }, '{{hotline}}')).toThrow()
    expect(() => parseAgentConfig({ ...raw, toolLabels: {} }, '{{hotline}}')).toThrow()
  })
})

describe('agent startup and terminal behavior', () => {
  it('loads the checked-in prompt and hotline', () => {
    const config = loadAgentConfig()
    expect(config.prompt).toContain('12356')
    expect(config.prompt).not.toContain('{{')
    expect(config.publicConfig.presetQuestions.length).toBeGreaterThan(0)
  })
  it('rejects undefined failures consistently', async () => {
    const q = new AsyncQueue<number>()
    q.fail(undefined)
    await expect(q[Symbol.asyncIterator]().next()).rejects.toBeUndefined()
  })
  it('allows fake without key and rejects real engines without key', () => {
    const env = { DATABASE_URL: 'mysql://localhost/test', INTERNAL_TOKEN: 'a'.repeat(32), JWT_SECRET: 'b'.repeat(32) }
    expect(loadEnv(env).AGENT_ENGINE).toBe('fake')
    for (const AGENT_ENGINE of ['dsh-tools', 'dsh-context']) {
      expect(() => loadEnv({ ...env, AGENT_ENGINE, DEEPSEEK_API_KEY: ' ' })).toThrow('DEEPSEEK_API_KEY')
      expect(loadEnv({ ...env, AGENT_ENGINE, DEEPSEEK_API_KEY: 'key' }).AGENT_ENGINE).toBe(AGENT_ENGINE)
    }
  })
  it('end wakes waiters and prevents pushes', async () => {
    const q = new AsyncQueue<number>(), iterator = q[Symbol.asyncIterator]()
    const pending = iterator.next()
    q.end(); q.push(1)
    expect((await pending).done).toBe(true)
    expect((await iterator.next()).done).toBe(true)
  })
  it('fake permits tool events and controlled rejection', async () => {
    const fake = new FakeAgentEngine(); fake.autoComplete = false
    const iterator = fake.ask({ userId: 'a', conversationId: 'c', dshSessionId: 's', text: '问' })[Symbol.asyncIterator]()
    const tool = { type: 'tool' as const, name: 'get_baseline', label: '查看' }
    fake.runs[0]!.queue.push(tool)
    expect((await iterator.next()).value).toEqual(tool)
    const pending = iterator.next()
    fake.runs[0]!.queue.fail(new Error('reject'))
    await expect(pending).rejects.toThrow('reject')
  })
  it('rejects empty presets, unknown labels and missing placeholders', () => {
    const raw = { hotline: '热线', presetQuestions: ['问'], toolLabels: Object.fromEntries(AGENT_TOOL_NAMES.map(n => [n, n])) }
    expect(() => parseAgentConfig({ ...raw, presetQuestions: [] }, '{{hotline}}')).toThrow()
    expect(() => parseAgentConfig({ ...raw, toolLabels: { ...raw.toolLabels, unknown: 'x' } }, '{{hotline}}')).toThrow()
    expect(() => parseAgentConfig(raw, 'no placeholder')).toThrow()
  })
})

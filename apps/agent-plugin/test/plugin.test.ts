import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'
import { AGENT_TOOL_NAMES } from '@should-quit/shared'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function install() {
  vi.stubEnv('INTERNAL_URL', 'http://127.0.0.1:3100'); vi.stubEnv('INTERNAL_TOKEN', 'test-token')
  const tools: ToolDefinition[] = [], disposers: Array<() => void> = []
  const ctx = { tools: { register: (tool: ToolDefinition) => { tools.push(tool); return vi.fn() } },
    effect: (factory: () => () => void) => disposers.push(factory()) }
  apply(ctx as unknown as Context)
  return { tools, disposers }
}
it('exactly four read-only tools, no userId in callback', async () => {
  const { tools, disposers } = install()
  expect(tools.map(t => t.name)).toEqual(AGENT_TOOL_NAMES)
  expect(disposers).toHaveLength(4)
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ totalScore: 50 }) })
  vi.stubGlobal('fetch', fetch)
  const exec = { agent: { id: 'session-a' }, signal: new AbortController().signal }
  await tools[0]!.execute({}, exec as never)
  const [, init] = fetch.mock.calls[0]!
  expect(JSON.parse(init.body)).toEqual({ sessionId: 'session-a', args: {} })
  expect(init.headers['x-internal-token']).toBe('test-token')
  await tools[0]!.execute({}, { signal: new AbortController().signal } as never)
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('callback failures become tool values', async () => {
  const { tools } = install()
  const fetch = vi.fn().mockRejectedValue(new Error('timeout')); vi.stubGlobal('fetch', fetch)
  const exec = { agent: { id: 'session-a' }, signal: new AbortController().signal }
  expect(await tools[0]!.execute({}, exec as never)).toContain('ERROR:')
  fetch.mockResolvedValue({ ok: false, status: 503 })
  expect(await tools[0]!.execute({}, exec as never)).toContain('503')
})

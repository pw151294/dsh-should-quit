import Taro from '@tarojs/taro'
import { beforeEach, expect, it, vi } from 'vitest'
import { formatAgentEvent, type AgentEvent } from '@should-quit/shared'
const mock = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: { request: mock.request, getStorageSync: () => '', setStorageSync: vi.fn(),
  login: vi.fn(), showToast: vi.fn().mockResolvedValue({}), reLaunch: vi.fn().mockResolvedValue({}) } }))
import { askStream } from '../src/services/agent-stream'
import { useAuth } from '../src/stores/auth'
beforeEach(() => {
  useAuth.setState({ token: 'token', user: { id: 'a', nickname: null, avatarUrl: null }, hasBaseline: true })
})
function wire(status: number, type: string, bytes: Uint8Array[], early = false) {
  mock.request.mockImplementation((options: { success(r: unknown): void; fail(): void }) => {
    let headers: (r: unknown) => void, chunk: (r: unknown) => void
    queueMicrotask(() => {
      if (early) for (const b of bytes) chunk({ data: b.slice().buffer })
      headers({ statusCode: status, header: { 'Content-Type': type } })
      if (!early) for (const b of bytes) chunk({ data: b.slice().buffer })
      options.success({ statusCode: status, data: '' })
    })
    return { onHeadersReceived: (fn: typeof headers) => { headers = fn },
      onChunkReceived: (fn: typeof chunk) => { chunk = fn }, abort: () => options.fail() }
  })
}
it('all byte cuts preserve Chinese, ping and done', async () => {
  const expected: AgentEvent[] = [{ type: 'delta', text: '中文🙂' }, { type: 'done', messageId: 'm1' }]
  const bytes = new TextEncoder().encode(': ping\n\n' + expected.map(formatAgentEvent).join(''))
  for (let i = 1; i < bytes.length; i++) {
    wire(200, 'text/event-stream; charset=utf-8', [bytes.slice(0, i), bytes.slice(i)], i % 2 === 0)
    const events: AgentEvent[] = []
    await askStream('c', '问', event => events.push(event)).finished
    expect(events).toEqual(expected)
  }
})
it('non-SSE chunked error is reported as JSON and no agent event', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ code: 'RATE_LIMITED', message: '每小时最多30次' }))
  wire(429, 'application/json', [bytes.slice(0, 8), bytes.slice(8)])
  const onEvent = vi.fn()
  await expect(askStream('c', '问', onEvent).finished).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  expect(onEvent).not.toHaveBeenCalled()
})
it('EOF without terminal event is interrupted', async () => {
  wire(200, 'text/event-stream', [new TextEncoder().encode(formatAgentEvent({ type: 'delta', text: '部分' }))])
  await expect(askStream('c', '问', () => {}).finished).rejects.toThrow('回答中断')
})

it.each([409, 429, 503])('chunked JSON %s is parsed once', async status => {
  const body = { code: 'INTERNAL_ERROR', message: '失败🙂' }
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  wire(status, 'APPLICATION/JSON', Array.from(bytes, b => new Uint8Array([b])), true)
  await expect(askStream('c', '问', vi.fn()).finished).rejects.toMatchObject({ status, message: body.message })
})
it('ignores unknown frames and duplicate terminal events', async () => {
  wire(200, 'TEXT/EVENT-STREAM; charset=UTF-8', [new TextEncoder().encode('event: unknown\ndata: {}\n\n' + formatAgentEvent({type:'done',messageId:'m'}) + formatAgentEvent({type:'delta',text:'late'}))])
  const events: AgentEvent[] = []
  await askStream('c', '问', e => events.push(e)).finished
  expect(events).toEqual([{type:'done',messageId:'m'}])
})
it('abort before login continuation never starts a POST', async () => {
  mock.request.mockClear()
  const stream = askStream('c', '问', vi.fn())
  stream.abort()
  await expect(stream.finished).rejects.toThrow('连接已关闭')
  expect(mock.request).not.toHaveBeenCalled()
})
it('error retains partial text and is terminal', async () => {
  const expected: AgentEvent[] = [{type:'delta',text:'部分'}, {type:'error',code:'AGENT_TIMEOUT',message:'超时'}]
  wire(200, 'text/event-stream', [new TextEncoder().encode(expected.map(formatAgentEvent).join('') + formatAgentEvent({type:'done',messageId:'late'}))])
  const events: AgentEvent[] = []
  await askStream('c','问', e => events.push(e)).finished
  expect(events).toEqual(expected)
})

it('network failure is never retried and removes both listeners', async () => {
  const offHeadersReceived = vi.fn(), offChunkReceived = vi.fn()
  mock.request.mockImplementation(options => {
    queueMicrotask(() => options.fail())
    return {onHeadersReceived: vi.fn(),onChunkReceived:vi.fn(),offHeadersReceived,offChunkReceived,abort:vi.fn()}
  })
  mock.request.mockClear()
  await expect(askStream('c','问',vi.fn()).finished).rejects.toThrow('回答中断')
  expect(mock.request).toHaveBeenCalledTimes(1)
  expect(offHeadersReceived).toHaveBeenCalledTimes(1)
  expect(offChunkReceived).toHaveBeenCalledTimes(1)
})
it('abort after chunked 401 settles does not start authentication or retry', async () => {
  let stream: ReturnType<typeof askStream>
  const login = vi.mocked(Taro.login)
  login.mockClear()
  mock.request.mockClear()
  mock.request.mockImplementation(options => {
    let headers: (value: unknown) => void, chunk: (value: unknown) => void
    queueMicrotask(() => {
      headers({ statusCode: 401, header: { 'Content-Type': 'application/json' } })
      chunk({ data: new TextEncoder().encode('{"code":"UNAUTHORIZED","message":"expired"}').buffer })
      options.success({ statusCode: 401, data: '' })
      stream.abort()
    })
    return { onHeadersReceived: (fn: typeof headers) => { headers = fn },
      onChunkReceived: (fn: typeof chunk) => { chunk = fn }, abort: vi.fn() }
  })
  stream = askStream('c', '问', vi.fn())
  await expect(stream.finished).rejects.toThrow('连接已关闭')
  expect(login).not.toHaveBeenCalled()
  expect(mock.request).toHaveBeenCalledTimes(1)
})

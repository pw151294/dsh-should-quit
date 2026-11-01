import { describe, expect, it } from 'vitest'
import { formatAgentEvent, parseAgentEvent } from '../src/stream/agent-events.js'
import { SseParser } from '../src/stream/sse.js'
import type { AgentEvent } from '../src/dto.js'

const EVENTS: AgentEvent[] = [
  { type: 'tool', name: 'get_score_summary', label: '正在查看你的评分' },
  { type: 'delta', text: '你现在 47 分，\n处在🟠骑驴找马。' },
  { type: 'error', code: 'AGENT_TIMEOUT', message: '回答超时' },
  { type: 'done', messageId: 'm1' },
]

describe('agent events', () => {
  it('format → SseParser → parse 往返一致', () => {
    const p = new SseParser()
    const frames = p.push(EVENTS.map(formatAgentEvent).join(''))
    expect(frames.map(parseAgentEvent)).toEqual(EVENTS)
  })
  it('帧的 event 名等于 type', () => {
    expect(formatAgentEvent({ type: 'done', messageId: 'm1' }).startsWith('event: done\n')).toBe(true)
  })
  it('未知事件、JSON 损坏、字段缺失、event 与 type 不一致都返回 null', () => {
    expect(parseAgentEvent({ event: 'message', data: '{}' })).toBeNull()
    expect(parseAgentEvent({ event: 'delta', data: '{not json' })).toBeNull()
    expect(parseAgentEvent({ event: 'delta', data: '{"type":"delta"}' })).toBeNull()
    expect(parseAgentEvent({ event: 'done', data: '{"type":"delta","text":"x"}' })).toBeNull()
  })
  it('error 事件的 code 必须是已知错误码', () => {
    expect(parseAgentEvent({ event: 'error', data: '{"type":"error","code":"BOOM","message":"x"}' })).toBeNull()
  })
})

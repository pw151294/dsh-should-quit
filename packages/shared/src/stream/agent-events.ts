// packages/shared/src/stream/agent-events.ts
import type { AgentEvent } from '../dto.js'
import { ErrorCode } from '../errors.js'
import { formatSseFrame, type SseFrame } from './sse.js'

export function formatAgentEvent(e: AgentEvent): string {
  return formatSseFrame(e.type, e)
}

const isStr = (v: unknown): v is string => typeof v === 'string'

export function parseAgentEvent(frame: SseFrame): AgentEvent | null {
  let o: Record<string, unknown>
  try {
    const v: unknown = JSON.parse(frame.data)
    if (typeof v !== 'object' || v === null) return null
    o = v as Record<string, unknown>
  } catch {
    return null
  }
  if (o.type !== frame.event) return null
  switch (o.type) {
    case 'delta':
      return isStr(o.text) ? { type: 'delta', text: o.text } : null
    case 'tool':
      return isStr(o.name) && isStr(o.label) ? { type: 'tool', name: o.name, label: o.label } : null
    case 'done':
      return isStr(o.messageId) ? { type: 'done', messageId: o.messageId } : null
    case 'error':
      return isStr(o.code) && Object.prototype.hasOwnProperty.call(ErrorCode, o.code) && isStr(o.message)
        ? { type: 'error', code: o.code as ErrorCode, message: o.message }
        : null
    default:
      return null
  }
}

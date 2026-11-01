import type { HarnessNotification } from '@deepseek-ai/dsh-sdk-client'
import { AGENT_TOOL_NAMES } from '@should-quit/shared'
import type { AgentConfig } from '../agent-config.js'
import type { EngineEvent } from '../engine.js'
export function mapNotification(n: HarnessNotification, sessionId: string, config: AgentConfig): EngineEvent | null {
  if (n.method !== 'session.event') return null
  const params = n.params as { sessionId?: string; event?: Record<string, unknown> }
  if (params.sessionId !== sessionId || !params.event) return null
  const event = params.event
  const data = (event.data ?? event) as Record<string, unknown>
  if (event.type === 'assistant/message') {
    const message = data.message as { content?: Array<{ type: string; text?: string }> } | undefined
    const text = (message?.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('')
    return text ? { type: 'delta', text } : null
  }
  if (event.type === 'tool/call') {
    const name = String(data.name ?? '')
    const tool = AGENT_TOOL_NAMES.find(t => t === name)
    return tool ? { type: 'tool', name: tool, label: config.toolLabels[tool] } : null
  }
  return null
}

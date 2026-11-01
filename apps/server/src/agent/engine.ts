import type { AgentEvent } from '@should-quit/shared'
export const AGENT_ENGINE = Symbol('AGENT_ENGINE')
export const SESSION_FACTORY = Symbol('SESSION_FACTORY')
export interface EngineInput {
  userId: string; conversationId: string; dshSessionId: string; text: string
}
export type EngineEvent = Extract<AgentEvent, { type: 'delta' | 'tool' }>
export interface AgentEngine { ask(p: EngineInput): AsyncIterable<EngineEvent> }
export interface SessionFactory { createSessionId(): string }
export class EngineError extends Error {
  constructor(readonly code: 'AGENT_UNAVAILABLE', message: string, readonly interrupted = false) {
    super(message)
  }
}

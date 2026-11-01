import { create } from 'zustand'
import type { AgentEvent, MessageView } from '@should-quit/shared'
export interface ChatTurn {
  key: number; question: string; answer: string; tools: string[]
  error?: string; state: 'pending' | 'complete' | 'failed' | 'interrupted'; messageId?: string
}
interface Session { history: MessageView[]; turns: ChatTurn[] }
interface ChatState {
  sessions: Record<string, Session>
  reset(): void; setHistory(id: string, messages: MessageView[]): void
  reconcile(id: string, messages: MessageView[]): void
  start(id: string, question: string): number
  event(id: string, key: number, event: AgentEvent): void
  interrupt(id: string, key: number): void
}
let serial = 0
export const useChat = create<ChatState>((set, get) => ({
  sessions: {}, reset: () => set({ sessions: {} }),
  reconcile: (id, messages) => set(s => {
    const session = s.sessions[id]
    if (!session) return s
    // Only the entry snapshot belongs to history; every later attempt belongs to turns.
    const refreshed = new Map(messages.map(m => [m.id, m]))
    return { sessions: { ...s.sessions, [id]: { ...session,
      history: session.history.map(m => refreshed.get(m.id) ?? m) } } }
  }),
  setHistory: (id, history) => set(s => ({ sessions: { ...s.sessions,
    [id]: { history, turns: [] } } })),
  start: (id, question) => {
    const session = get().sessions[id] ?? { history: [], turns: [] }
    if (session.turns.some(t => t.state === 'pending')) throw new Error('正在回答')
    const key = ++serial
    set(s => ({ sessions: { ...s.sessions, [id]: { ...session, turns: [...session.turns,
      { key, question, answer: '', tools: [], state: 'pending' }] } } }))
    return key
  },
  event: (id, key, event) => set(s => {
    const session = s.sessions[id]
    if (!session) return s
    return { sessions: { ...s.sessions, [id]: { ...session, turns: session.turns.map(t => {
      if (t.key !== key || t.state !== 'pending') return t
      if (event.type === 'delta') return { ...t, answer: t.answer + event.text }
      if (event.type === 'tool') return { ...t, tools: [...t.tools, event.label] }
      if (event.type === 'done') return { ...t, state: 'complete', messageId: event.messageId }
      return { ...t, error: event.message, state: event.code === 'AGENT_TIMEOUT' ? 'interrupted' : 'failed' }
    }) } } }
  }),
  interrupt: (id, key) => set(s => {
    const session = s.sessions[id]
    if (!session) return s
    return { sessions: { ...s.sessions, [id]: { ...session, turns: session.turns.map(t =>
      t.key === key && t.state === 'pending' ? { ...t, state: 'interrupted' } : t) } } }
  }),
}))

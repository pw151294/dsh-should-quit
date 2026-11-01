import { describe, expect, it } from 'vitest'
import { latestFirst, restoredHistoryHint } from '../src/services/chat-model'
import { useChat } from '../src/stores/chat'
describe('chat', () => {
  it('orders old conversations by latest activity with server ID ties without mutation', () => {
    const rows = [
      { id: 'a', createdAt: '2026-02-01', lastMessageAt: '2026-02-01' },
      { id: 'b', createdAt: '2026-01-01', lastMessageAt: '2026-03-01' },
      { id: 'c', createdAt: '2026-01-01', lastMessageAt: '2026-03-01' },
    ]
    expect(latestFirst(rows).map(row => row.id)).toEqual(['c', 'b', 'a'])
    expect(rows.map(row => row.id)).toEqual(['a', 'b', 'c'])
  })
  it('explains only restored history ending with an unanswered USER', () => {
    expect(restoredHistoryHint([])).toBeUndefined()
    expect(restoredHistoryHint([{ role: 'USER' }])).toBe('上一条回答可能仍在后台运行')
    expect(restoredHistoryHint([{ role: 'USER' }, { role: 'ASSISTANT' }])).toBeUndefined()
  })
  it('appends deltas, retains tools and real ID, preserves failed retries', () => {
    const s = useChat.getState(); s.reset(); const k = s.start('a', 'question')
    s.event('a', k, { type: 'delta', text: 'one' }); s.event('a', k, { type: 'delta', text: 'two' })
    s.event('a', k, { type: 'tool', name: 'search', label: 'search' }); s.event('a', k, { type: 'done', messageId: 'real' })
    expect(useChat.getState().sessions.a!.turns[0]).toMatchObject({ answer: 'onetwo', tools: ['search'], messageId: 'real', state: 'complete' })
    const next = s.start('a', 'original'); s.interrupt('a', next); s.start('a', 'original')
    expect(useChat.getState().sessions.a!.turns.map(t => t.state)).toEqual(['complete', 'interrupted', 'pending'])
    expect(useChat.getState().sessions.b).toBeUndefined()
  })
  it('reconciles completed history without duplicate bubbles or losing active turns', () => {
    const s = useChat.getState(); s.reset()
    const key = s.start('a', 'question')
    s.event('a', key, { type: 'tool', name: 'search', label: 'tool' })
    s.event('a', key, { type: 'done', messageId: 'answer' })
    s.start('a', 'next')
    const messages = [
      { id: 'question', role: 'USER', content: 'question', status: 'COMPLETE', createdAt: '2026-01-01' },
      { id: 'answer', role: 'ASSISTANT', content: 'answer', status: 'COMPLETE', createdAt: '2026-01-01' },
    ] as Parameters<typeof s.reconcile>[1]
    s.reconcile('a', messages)
    const session = useChat.getState().sessions.a!
    expect(session.history).toEqual([])
    expect(session.turns[0]?.tools).toEqual(['tool'])
    expect(session.turns[1]).toMatchObject({ question: 'next', state: 'pending' })
  })
  it('keeps repeated failed retries and subsequent pending pairs virtual across reordered refreshes', () => {
    const s = useChat.getState(); s.reset(); s.setHistory('a', [])
    const first = s.start('a', 'same'); s.interrupt('a', first)
    const retry = s.start('a', 'same'); s.event('a', retry, { type: 'done', messageId: 'a2' })
    s.start('a', 'same')
    const pair = (n: number) => [
      { id: `u${n}`, role: 'USER', content: 'same', status: 'COMPLETE', createdAt: '2026-01-01' },
      { id: `a${n}`, role: 'ASSISTANT', content: `answer${n}`, status: n === 1 ? 'INTERRUPTED' : 'COMPLETE', createdAt: '2026-01-01' },
    ] as Parameters<typeof s.reconcile>[1]
    s.reconcile('a', [...pair(1), ...pair(2), ...pair(3)])
    s.reconcile('a', pair(1))
    expect(useChat.getState().sessions.a!.history).toEqual([])
    expect(useChat.getState().sessions.a!.turns.map(t => t.state)).toEqual(['interrupted', 'complete', 'pending'])
  })
})

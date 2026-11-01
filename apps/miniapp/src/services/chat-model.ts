import type { MessageView } from '@should-quit/shared'
export const busyMessage = '上一条回答还在后台收尾，稍等片刻再试，或新开一个会话'
export function previousQuestion(messages: MessageView[], index: number) {
  return messages.slice(0, index).reverse().find(m => m.role === 'USER')?.content
}
export function latestFirst<T extends { id: string; lastMessageAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt) || b.id.localeCompare(a.id))
}
export function restoredHistoryHint(messages: ReadonlyArray<{ role: string }>): string | undefined {
  return messages.at(-1)?.role === 'USER' ? '上一条回答可能仍在后台运行' : undefined
}

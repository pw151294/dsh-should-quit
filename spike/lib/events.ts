// spike/lib/events.ts
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { HarnessNotification } from '@deepseek-ai/dsh-sdk-client'

/** 事件判别字段：按 Task 1 Step 3 的结果调整 */
export function eventType(e: SessionEvent): string {
  return String((e as unknown as { type?: unknown }).type ?? '')
}

/** 事件负载：按 Task 1 Step 3 的结果调整（若负载与判别字段平级，直接返回 e） */
export function eventData(e: SessionEvent): Record<string, unknown> {
  const anyE = e as unknown as { data?: Record<string, unknown> }
  return anyE.data ?? (e as unknown as Record<string, unknown>)
}

/** 本次运行中模型调用过的工具名 */
export function toolCalls(events: SessionEvent[]): string[] {
  return events
    .filter((e) => eventType(e) === 'tool/call')
    .map((e) => String(eventData(e).name ?? ''))
}

/** 流式粒度观察：记录每条 assistant/message 到达的时间与文本长度 */
export interface StreamObservation {
  assistantMessages: Array<{ at: number; textLength: number }>
  otherMethods: Set<string>
}

export function createObserver(): {
  observation: StreamObservation
  onNotification: (n: HarnessNotification) => void
} {
  const observation: StreamObservation = { assistantMessages: [], otherMethods: new Set() }
  const onNotification = (n: HarnessNotification): void => {
    if (n.method !== 'session.event') {
      observation.otherMethods.add(n.method)
      return
    }
    const event = (n.params as { event?: SessionEvent }).event
    if (!event) return
    if (eventType(event) === 'assistant/message') {
      const message = eventData(event).message as { content?: Array<{ type?: string; text?: string }> } | undefined
      const text = (message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      observation.assistantMessages.push({ at: Date.now(), textLength: text.length })
    } else {
      observation.otherMethods.add(`session.event:${eventType(event)}`)
    }
  }
  return { observation, onNotification }
}

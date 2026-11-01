import { randomUUID } from 'node:crypto'
import { AsyncQueue } from './async-queue.js'
import type { AgentEngine, EngineEvent, EngineInput, SessionFactory } from './engine.js'
export class FakeAgentEngine implements AgentEngine, SessionFactory {
  // 手动控制事件和结束。
  autoComplete = true
  readonly runs: Array<{ input: EngineInput; queue: AsyncQueue<EngineEvent> }> = []
  createSessionId(): string { return `session-${randomUUID().replaceAll('-', '')}` }
  ask(input: EngineInput): AsyncIterable<EngineEvent> {
    const queue = new AsyncQueue<EngineEvent>()
    this.runs.push({ input, queue })
    if (this.autoComplete) queueMicrotask(() => {
      queue.push({ type: 'delta', text: '这是本地演示回答，请结合实际情况审慎决定。' })
      queue.end()
    })
    return queue
  }
}

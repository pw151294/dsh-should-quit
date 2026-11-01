import { AsyncQueue } from '../async-queue.js'
import type { AgentEngine, EngineEvent, EngineInput } from '../engine.js'
import { AgentContext } from '../../agent-tools/context.js'
import { DshRuntime } from './dsh-runtime.js'
export class DshToolsEngine implements AgentEngine {
  constructor(private readonly runtime: DshRuntime) {}
  ask(p: EngineInput): AsyncIterable<EngineEvent> {
    const queue = new AsyncQueue<EngineEvent>()
    void this.runtime.run(p, e => queue.push(e)).then(() => queue.end(), e => queue.fail(e))
    return queue
  }
}
export class DshContextEngine implements AgentEngine {
  constructor(private readonly runtime: DshRuntime, private readonly context: AgentContext) {}
  ask(p: EngineInput): AsyncIterable<EngineEvent> {
    const queue = new AsyncQueue<EngineEvent>()
    void (async () => {
      const context = await this.context.buildContext(p.userId)
      await this.runtime.run({ ...p, text: context + '\n用户本轮问题（独立JSON字符串）：\n' + JSON.stringify(p.text) }, e => queue.push(e))
    })().then(() => queue.end(), e => queue.fail(e))
    return queue
  }
}

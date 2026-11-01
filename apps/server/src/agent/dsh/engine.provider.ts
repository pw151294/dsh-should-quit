import type { AgentEngine } from '../engine.js'
import type { AgentContext } from '../../agent-tools/context.js'
import type { DshRuntime } from './dsh-runtime.js'
import { DshContextEngine, DshToolsEngine } from './dsh.engine.js'
export function createDshEngine(mode: 'dsh-tools' | 'dsh-context', runtime: DshRuntime, context: AgentContext): AgentEngine {
  return mode === 'dsh-tools' ? new DshToolsEngine(runtime) : new DshContextEngine(runtime, context)
}

import type { FactoryProvider } from '@nestjs/common'
import { ENV, type Env } from '../../env.js'
import { AgentContext as Context } from '../../agent-tools/context.js'
import { AGENT_ENGINE } from '../engine.js'
import { FakeAgentEngine } from '../fake.engine.js'
import { DshRuntime as Runtime } from './dsh-runtime.js'
export const engineProvider: FactoryProvider<AgentEngine> = {
  provide: AGENT_ENGINE, inject: [ENV, Runtime, FakeAgentEngine, Context],
  useFactory: (env: Env, runtime: Runtime, fake: FakeAgentEngine, context: Context) =>
    env.AGENT_ENGINE === 'fake' ? fake : createDshEngine(env.AGENT_ENGINE, runtime, context),
}

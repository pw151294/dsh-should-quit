// apps/server/src/agent/agent.module.ts
import { Module } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AgentToolsModule } from '../agent-tools/agent-tools.module.js'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { AGENT_CONFIG, loadAgentConfig } from './agent-config.js'
import { SESSION_FACTORY } from './engine.js'
import { FakeAgentEngine } from './fake.engine.js'
import { ConversationService } from './conversation.service.js'
import { AgentService } from './agent.service.js'
import { AgentController } from './agent.controller.js'
import { DshRuntime } from './dsh/dsh-runtime.js'
import { engineProvider } from './dsh/engine.provider.js'
@Module({ imports: [AgentToolsModule], controllers: [AgentController], providers: [
  { provide: AGENT_CONFIG, useFactory: loadAgentConfig },
  { provide: SESSION_FACTORY, useValue: { createSessionId: () => `session-${randomUUID().replaceAll('-', '')}` } },
  FakeAgentEngine, ConversationService, DshRuntime, engineProvider, AgentService, BaselineRequiredGuard,
], exports: [AgentService, ConversationService, FakeAgentEngine] })
export class AgentModule {}

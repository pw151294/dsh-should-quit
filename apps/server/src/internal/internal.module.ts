import { Module } from '@nestjs/common'
import { AgentToolsModule } from '../agent-tools/agent-tools.module.js'
import { InternalController } from './internal.controller.js'
import { InternalTokenGuard } from './internal-token.guard.js'
@Module({ imports: [AgentToolsModule], controllers: [InternalController], providers: [InternalTokenGuard] })
export class InternalModule {}

import { Module } from '@nestjs/common'
import { CoreModule } from '../core.module.js'
import { ScoreModule } from '../score/score.module.js'
import { MoodModule } from '../mood/mood.module.js'
import { AgentToolsService } from './agent-tools.service.js'
import { AgentContext } from './context.js'
@Module({ imports: [CoreModule, ScoreModule, MoodModule], providers: [AgentToolsService, AgentContext],
  exports: [AgentToolsService, AgentContext] })
export class AgentToolsModule {}

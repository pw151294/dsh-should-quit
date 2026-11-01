// apps/server/src/agent/agent.controller.ts
import { Body, Controller, Get, Inject, Param, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { askSchema, type AskBody } from '@should-quit/shared'
import { UserId } from '../auth/decorators.js'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { AppError } from '../common/app-error.js'
import { ENV, type Env } from '../env.js'
import { AGENT_CONFIG, type AgentConfig } from './agent-config.js'
import { ConversationService } from './conversation.service.js'
import { AgentService } from './agent.service.js'
import { DshRuntime } from './dsh/dsh-runtime.js'
@Controller('agent')
@UseGuards(BaselineRequiredGuard)
export class AgentController {
  constructor(private readonly conversations: ConversationService, private readonly agent: AgentService,
    private readonly runtime: DshRuntime, @Inject(ENV) private readonly env: Env,
    @Inject(AGENT_CONFIG) private readonly configValue: AgentConfig) {}
  @Get('config') config() { return this.configValue.publicConfig }
  @Get('conversations') list(@UserId() userId: string) { return this.conversations.list(userId) }
  @Post('conversations') create(@UserId() userId: string) {
    if (this.env.AGENT_ENGINE !== 'fake' && !this.runtime.ready) throw new AppError('AGENT_RESTARTING', '智能体启动中')
    return this.conversations.create(userId)
  }
  @Get('conversations/:id/messages') messages(@UserId() userId: string, @Param('id') id: string) {
    return this.conversations.messages(userId, id)
  }
  @Post('conversations/:id/messages') ask(@UserId() userId: string, @Param('id') id: string,
    @Body(new ZodPipe(askSchema)) body: AskBody, @Res() res: Response) {
    return this.agent.ask(userId, id, body.text, res)
  }
}

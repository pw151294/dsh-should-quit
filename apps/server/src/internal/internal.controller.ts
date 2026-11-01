import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { agentToolNameSchema } from '@should-quit/shared'
import { PrismaService } from '../prisma/prisma.service.js'
import { AgentToolsService } from '../agent-tools/agent-tools.service.js'
import { AppError } from '../common/app-error.js'
import { InternalTokenGuard } from './internal-token.guard.js'
const bodySchema = z.strictObject({ sessionId: z.string().min(1), args: z.unknown() })
@Controller('internal/agent-tools')
@UseGuards(InternalTokenGuard)
export class InternalController {
  constructor(private readonly db: PrismaService, private readonly tools: AgentToolsService) {}
  @Post(':tool')
  async call(@Param('tool') name: string, @Body() raw: unknown): Promise<unknown> {
    const body = bodySchema.safeParse(raw), tool = agentToolNameSchema.safeParse(name)
    if (!body.success || !tool.success) throw new AppError('VALIDATION_FAILED', '工具请求无效')
    const conversation = await this.db.agentConversation.findUnique({ where: { dshSessionId: body.data.sessionId } })
    if (!conversation) throw new AppError('FORBIDDEN', '会话无效')
    return this.tools.execute(conversation.userId, tool.data, body.data.args)
  }
}

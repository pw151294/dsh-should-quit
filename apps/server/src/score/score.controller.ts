// apps/server/src/score/score.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { trendQuerySchema, type ScoreView, type TrendRange, type TrendResponse } from '@should-quit/shared'
import { UserId } from '../auth/decorators.js'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { ScoreService } from './score.service.js'

@Controller('score')
@UseGuards(BaselineRequiredGuard)
export class ScoreController {
  constructor(private readonly score: ScoreService) {}

  @Get('current')
  current(@UserId() userId: string): Promise<ScoreView> {
    return this.score.current(userId)
  }

  @Get('trend')
  trend(@UserId() userId: string, @Query(new ZodPipe(trendQuerySchema)) q: { range: TrendRange }): Promise<TrendResponse> {
    return this.score.trend(userId, q.range)
  }
}

// apps/server/src/mood/mood.controller.ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import {
  dailyQuerySchema, moodCreateSchema, moodDateQuerySchema,
  type MoodCreateBody, type MoodDailyItem, type MoodItem, type ScoreView,
} from '@should-quit/shared'
import { UserId } from '../auth/decorators.js'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { MoodService } from './mood.service.js'

@Controller('moods')
@UseGuards(BaselineRequiredGuard)
export class MoodController {
  constructor(private readonly mood: MoodService) {}

  @Post()
  create(@UserId() userId: string, @Body(new ZodPipe(moodCreateSchema)) body: MoodCreateBody): Promise<ScoreView> {
    return this.mood.create(userId, body)
  }

  @Get('daily')
  daily(@UserId() userId: string, @Query(new ZodPipe(dailyQuerySchema)) q: { days: number }): Promise<MoodDailyItem[]> {
    return this.mood.daily(userId, q.days)
  }

  @Get()
  byDate(@UserId() userId: string, @Query(new ZodPipe(moodDateQuerySchema)) q: { date: string }): Promise<MoodItem[]> {
    return this.mood.byDate(userId, q.date)
  }
}

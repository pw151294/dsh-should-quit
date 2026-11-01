// apps/server/src/mood/mood.service.ts
import { Injectable } from '@nestjs/common'
import {
  aggregateDaily, shiftDate,
  type MoodCreateBody, type MoodDailyItem, type MoodItem, type ScoreView,
} from '@should-quit/shared'
import { Clock } from '../clock.js'
import { fromDbDate, toDbDate } from '../db-date.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ScoreService } from '../score/score.service.js'

@Injectable()
export class MoodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly score: ScoreService,
  ) {}

  // zod 4 推断出的 MoodCreateBody 里 note 是必填键，这里放宽为可选，方便内部调用
  async create(userId: string, body: Pick<MoodCreateBody, 'stars'> & { note?: string | undefined }): Promise<ScoreView> {
    await this.prisma.moodCheckin.create({
      data: {
        userId,
        stars: body.stars,
        note: body.note ?? null,
        // 打卡日期由服务端时钟决定，不信任客户端
        checkinDate: toDbDate(this.clock.today()),
        createdAt: this.clock.now(),
      },
    })
    return this.score.recordSnapshot(userId)
  }

  async daily(userId: string, days: number): Promise<MoodDailyItem[]> {
    const today = this.clock.today()
    const rows = await this.prisma.moodCheckin.findMany({
      where: { userId, checkinDate: { gte: toDbDate(shiftDate(today, -(days - 1))), lte: toDbDate(today) } },
      select: { checkinDate: true, stars: true },
    })
    // 去掉 age，只返回前端需要的字段
    return aggregateDaily(rows.map((r) => ({ checkinDate: fromDbDate(r.checkinDate), stars: r.stars })), today, days)
      .map(({ date, avg, count }) => ({ date, avg, count }))
  }

  async byDate(userId: string, date: string): Promise<MoodItem[]> {
    const rows = await this.prisma.moodCheckin.findMany({
      where: { userId, checkinDate: toDbDate(date) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, stars: true, note: true, createdAt: true },
    })
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
  }
}

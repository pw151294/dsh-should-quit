// apps/server/src/score/score.service.ts
import { Inject, Injectable } from '@nestjs/common'
import {
  MOOD_WINDOW_DAYS, TREND_RANGE_DAYS, aggregateDaily, computeScore, shiftDate,
  type BaselineInput, type ScoreView, type TrendPoint, type TrendRange, type TrendResponse,
} from '@should-quit/shared'
import { Clock } from '../clock.js'
import { AppError } from '../common/app-error.js'
import { fromDbDate, toDbDate } from '../db-date.js'
import { retryOnUniqueConflict } from '../prisma/errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TIER_COPY, type TierCopyMap } from '../tiers/tier-copy.js'

@Injectable()
export class ScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(TIER_COPY) private readonly copy: TierCopyMap,
  ) {}

  async current(userId: string): Promise<ScoreView> {
    const today = this.clock.today()
    const baseline = await this.prisma.baseline.findUnique({ where: { userId } })
    if (!baseline) throw new AppError('BASELINE_REQUIRED', '请先完成工作基准录入')

    const since = shiftDate(today, -(MOOD_WINDOW_DAYS - 1))
    const rows = await this.prisma.moodCheckin.findMany({
      where: { userId, checkinDate: { gte: toDbDate(since), lte: toDbDate(today) } },
      select: { checkinDate: true, stars: true },
    })
    const daily = aggregateDaily(rows.map((r) => ({ checkinDate: fromDbDate(r.checkinDate), stars: r.stars })), today)
    const { userId: _u, updatedAt: _t, ...levels } = baseline
    const result = computeScore(levels as BaselineInput, daily)
    return { ...result, copy: this.copy[result.tier] }
  }

  async recordSnapshot(userId: string): Promise<ScoreView> {
    const view = await this.current(userId)
    const snapshotDate = toDbDate(this.clock.today())
    const data = {
      objectiveScore: view.objectiveScore,
      moodScore: view.moodScore,
      totalScore: view.totalScore,
      tier: view.tier,
      breakdown: view.breakdown,
      algoVersion: view.algoVersion,
    }
    // @@unique([userId, snapshotDate]) 保证同一天只有一行，但并发首写会抛 P2002，需重试
    await retryOnUniqueConflict(() => this.prisma.scoreSnapshot.upsert({
      where: { userId_snapshotDate: { userId, snapshotDate } },
      create: { userId, snapshotDate, ...data },
      update: data,
    }))
    return view
  }

  async trend(userId: string, range: TrendRange): Promise<TrendResponse> {
    const start = toDbDate(shiftDate(this.clock.today(), -(TREND_RANGE_DAYS[range] - 1)))
    const [items, before] = await Promise.all([
      this.prisma.scoreSnapshot.findMany({ where: { userId, snapshotDate: { gte: start } }, orderBy: { snapshotDate: 'asc' } }),
      this.prisma.scoreSnapshot.findFirst({ where: { userId, snapshotDate: { lt: start } }, orderBy: { snapshotDate: 'desc' } }),
    ])
    return { before: before ? toPoint(before) : null, items: items.map(toPoint) }
  }
}

type SnapshotRow = {
  snapshotDate: Date
  totalScore: number
  tier: TrendPoint['tier']
  objectiveScore: { toNumber(): number }
  moodScore: { toNumber(): number } | null
}

function toPoint(s: SnapshotRow): TrendPoint {
  return {
    date: fromDbDate(s.snapshotDate),
    totalScore: s.totalScore,
    tier: s.tier,
    objectiveScore: s.objectiveScore.toNumber(),
    moodScore: s.moodScore === null ? null : s.moodScore.toNumber(),
  }
}

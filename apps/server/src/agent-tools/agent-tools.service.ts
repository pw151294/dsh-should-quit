import { Injectable } from '@nestjs/common'
import { BASELINE_FIELDS, optionLabel, shiftDate, toolArgsSchemas, type AgentToolName } from '@should-quit/shared'
import { PrismaService } from '../prisma/prisma.service.js'
import { ScoreService } from '../score/score.service.js'
import { MoodService } from '../mood/mood.service.js'
import { Clock } from '../clock.js'
import { toDbDate } from '../db-date.js'
import { AppError } from '../common/app-error.js'
@Injectable()
export class AgentToolsService {
  constructor(private readonly db: PrismaService, private readonly score: ScoreService,
    private readonly mood: MoodService, private readonly clock: Clock) {}
  async execute(userId: string, tool: AgentToolName, args: unknown): Promise<unknown> {
    // 每个工具都要求基准存在，复用权威计算也确保没有另算分。
    const parsed = toolArgsSchemas[tool].safeParse(args)
    if (!parsed.success) throw new AppError('VALIDATION_FAILED', '工具参数无效')
    const current = await this.score.current(userId)
    switch (tool) {
      case 'get_score_summary': return current
      case 'get_baseline': {
        const b = await this.db.baseline.findUniqueOrThrow({ where: { userId } })
        return BASELINE_FIELDS.map(field => ({ field, level: b[field],
          label: optionLabel(field, b[field]), score: current.breakdown[field] }))
      }
      case 'get_score_trend':
        return this.score.trend(userId, toolArgsSchemas.get_score_trend.parse(args).range)
      case 'get_mood_history': {
        const { days } = toolArgsSchemas.get_mood_history.parse(args)
        const today = this.clock.today(), since = shiftDate(today, -(days - 1))
        const [daily, notes] = await Promise.all([
          this.mood.daily(userId, days),
          this.db.moodCheckin.findMany({ where: { userId, note: { not: null },
            checkinDate: { gte: toDbDate(since), lte: toDbDate(today) } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20,
            select: { stars: true, note: true, createdAt: true } }),
        ])
        return { daily, notes: notes.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })) }
      }
    }
  }
}

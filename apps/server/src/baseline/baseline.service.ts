// apps/server/src/baseline/baseline.service.ts
import { Injectable } from '@nestjs/common'
import { BASELINE_FIELDS, type BaselineBody, type BaselineResponse, type ScoreView } from '@should-quit/shared'
import { retryOnUniqueConflict } from '../prisma/errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ScoreService } from '../score/score.service.js'

@Injectable()
export class BaselineService {
  constructor(private readonly prisma: PrismaService, private readonly score: ScoreService) {}

  async get(userId: string): Promise<BaselineResponse> {
    const row = await this.prisma.baseline.findUnique({ where: { userId } })
    if (!row) return { baseline: null }
    // 只挑 8 个业务字段，不把 userId / updatedAt 带给前端
    const baseline = Object.fromEntries(BASELINE_FIELDS.map((f) => [f, row[f]])) as BaselineBody
    return { baseline }
  }

  async save(userId: string, body: BaselineBody): Promise<ScoreView> {
    // 并发首次保存会撞主键，重试一次走 update
    await retryOnUniqueConflict(() =>
      this.prisma.baseline.upsert({ where: { userId }, create: { userId, ...body }, update: body }))
    return this.score.recordSnapshot(userId)
  }
}

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { BaselineService } from '../src/baseline/baseline.service.js'
import { FixedClock } from '../src/clock.js'
import { ScoreService } from '../src/score/score.service.js'
import { loadTierCopy } from '../src/tiers/tier-copy.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
const clock = new FixedClock(new Date('2026-10-31T04:00:00Z'))
const score = new ScoreService(prisma as never, clock, loadTierCopy())
const svc = new BaselineService(prisma as never, score)
const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 } as const
const ALL5 = { salary: 5, commute: 5, overtime: 5, restTime: 5, workload: 5, stabilityBenefits: 5, growth: 5, contentFit: 5 } as const

describe('BaselineService', () => {
  let userId: string
  beforeEach(async () => {
    await truncateAll(prisma)
    userId = (await prisma.user.create({ data: { openid: 'mock_b' } })).id
  })
  afterAll(() => prisma.$disconnect())

  it('未录入时返回 { baseline: null }', async () => {
    expect(await svc.get(userId)).toEqual({ baseline: null })
  })
  it('首次保存：写入基准、写当天快照、返回最新评分', async () => {
    const s = await svc.save(userId, ALL3)
    expect(s).toMatchObject({ objectiveScore: 50, totalScore: 50, tier: 'SEEK' })
    expect(await svc.get(userId)).toEqual({ baseline: ALL3 })
    expect(await prisma.scoreSnapshot.count({ where: { userId } })).toBe(1)
  })
  it('再次保存整份覆盖，当天快照更新而不是新增', async () => {
    await svc.save(userId, ALL3)
    const s = await svc.save(userId, ALL5)
    expect(s).toMatchObject({ objectiveScore: 100, totalScore: 100, tier: 'STAY' })
    expect(await svc.get(userId)).toEqual({ baseline: ALL5 })
    const rows = await prisma.scoreSnapshot.findMany({ where: { userId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.totalScore).toBe(100)
  })
  it('并发首次保存全部成功且只有一行 Baseline', async () => {
    // 多轮放大竞态，每轮新用户
    for (let round = 0; round < 5; round++) {
      const id = (await prisma.user.create({ data: { openid: `mock_c${round}` } })).id
      await Promise.all(Array.from({ length: 8 }, () => svc.save(id, ALL3)))
      expect(await prisma.baseline.count({ where: { userId: id } })).toBe(1)
      expect(await prisma.scoreSnapshot.count({ where: { userId: id } })).toBe(1)
    }
  })
})

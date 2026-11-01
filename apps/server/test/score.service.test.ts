import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from '../src/clock.js'
import { toDbDate } from '../src/db-date.js'
import { ScoreService } from '../src/score/score.service.js'
import { loadTierCopy } from '../src/tiers/tier-copy.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
// 2026-10-31 12:00 北京时间
const clock = new FixedClock(new Date('2026-10-31T04:00:00Z'))
const svc = new ScoreService(prisma as never, clock, loadTierCopy())
const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 }

async function userWithBaseline(levels = ALL3): Promise<string> {
  const u = await prisma.user.create({ data: { openid: `mock_${Math.random()}` } })
  await prisma.baseline.create({ data: { userId: u.id, ...levels } })
  return u.id
}
async function checkin(userId: string, date: string, stars: number): Promise<void> {
  await prisma.moodCheckin.create({ data: { userId, stars, checkinDate: toDbDate(date) } })
}

describe('ScoreService', () => {
  beforeEach(async () => {
    await truncateAll(prisma)
    clock.set(new Date('2026-10-31T04:00:00Z'))
  })
  afterAll(() => prisma.$disconnect())

  it('没有基准时抛 BASELINE_REQUIRED', async () => {
    const u = await prisma.user.create({ data: { openid: 'mock_x' } })
    await expect(svc.current(u.id)).rejects.toMatchObject({ code: 'BASELINE_REQUIRED' })
  })
  it('没有打卡：moodScore 为 null，总分等于客观分，附带档位文案', async () => {
    const id = await userWithBaseline()
    const s = await svc.current(id)
    expect(s).toMatchObject({ objectiveScore: 50, moodScore: null, totalScore: 50, tier: 'SEEK', algoVersion: 1 })
    expect(s.copy.slogan).toBe('骑驴找马，悄悄看机会')
    expect(s.breakdown.salary).toBe(50)
  })
  it('有打卡：按 0.6/0.4 加权', async () => {
    const id = await userWithBaseline()
    await checkin(id, '2026-10-31', 5) // 心情 100
    expect((await svc.current(id)).totalScore).toBe(70) // 50*0.6 + 100*0.4
  })
  it('30 天窗口：距今 29 天计入，30 天不计入', async () => {
    const id = await userWithBaseline()
    await checkin(id, '2026-10-01', 5) // age 30，不计入
    expect((await svc.current(id)).moodScore).toBeNull()
    await checkin(id, '2026-10-02', 1) // age 29，计入
    expect((await svc.current(id)).moodScore).toBe(0)
  })
  it('只看自己的打卡', async () => {
    const a = await userWithBaseline()
    const b = await userWithBaseline()
    await checkin(b, '2026-10-31', 5)
    expect((await svc.current(a)).moodScore).toBeNull()
  })
  it('同一天多次 recordSnapshot 只保留一行，取最后一次', async () => {
    const id = await userWithBaseline()
    await svc.recordSnapshot(id)
    await checkin(id, '2026-10-31', 5)
    const s = await svc.recordSnapshot(id)
    const rows = await prisma.scoreSnapshot.findMany({ where: { userId: id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.totalScore).toBe(s.totalScore)
    expect(rows[0]!.totalScore).toBe(70)
  })
  it('趋势：返回范围内快照（升序）与范围起点前最近一条', async () => {
    const id = await userWithBaseline()
    clock.set(new Date('2026-10-20T04:00:00Z'))
    await svc.recordSnapshot(id) // 范围外
    clock.set(new Date('2026-10-28T04:00:00Z'))
    await svc.recordSnapshot(id)
    clock.set(new Date('2026-10-31T04:00:00Z'))
    await svc.recordSnapshot(id)
    const t = await svc.trend(id, '7d') // 2026-10-25 ~ 2026-10-31
    expect(t.before?.date).toBe('2026-10-20')
    expect(t.items.map((p) => p.date)).toEqual(['2026-10-28', '2026-10-31'])
    expect(t.items[0]).toMatchObject({ totalScore: 50, tier: 'SEEK', objectiveScore: 50, moodScore: null })
  })
  it('并发首次 recordSnapshot 全部成功且只有一行', async () => {
    // 多轮放大竞态
    for (let round = 0; round < 5; round++) {
      const id = await userWithBaseline()
      await Promise.all(Array.from({ length: 8 }, () => svc.recordSnapshot(id)))
      expect(await prisma.scoreSnapshot.count({ where: { userId: id } })).toBe(1)
    }
  })
  it('趋势 7d 边界：10-24 排除，10-25 计入', async () => {
    const id = await userWithBaseline()
    clock.set(new Date('2026-10-24T04:00:00Z'))
    await svc.recordSnapshot(id)
    clock.set(new Date('2026-10-25T04:00:00Z'))
    await svc.recordSnapshot(id)
    clock.set(new Date('2026-10-31T04:00:00Z'))
    const t = await svc.trend(id, '7d')
    expect(t.before?.date).toBe('2026-10-24')
    expect(t.items.map((p) => p.date)).toEqual(['2026-10-25'])
  })
  it('趋势：没有更早快照时 before 为 null', async () => {
    const id = await userWithBaseline()
    await svc.recordSnapshot(id)
    expect((await svc.trend(id, '30d')).before).toBeNull()
  })
})

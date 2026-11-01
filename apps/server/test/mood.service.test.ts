import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from '../src/clock.js'
import { MoodService } from '../src/mood/mood.service.js'
import { ScoreService } from '../src/score/score.service.js'
import { loadTierCopy } from '../src/tiers/tier-copy.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
const clock = new FixedClock(new Date('2026-10-31T04:00:00Z'))
const score = new ScoreService(prisma as never, clock, loadTierCopy())
const svc = new MoodService(prisma as never, clock, score)
const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 }

describe('MoodService', () => {
  let userId: string
  beforeEach(async () => {
    await truncateAll(prisma)
    clock.set(new Date('2026-10-31T04:00:00Z'))
    userId = (await prisma.user.create({ data: { openid: 'mock_m' } })).id
    await prisma.baseline.create({ data: { userId, ...ALL3 } })
  })
  afterAll(() => prisma.$disconnect())

  it('打卡后返回最新评分，并写当天快照', async () => {
    const s = await svc.create(userId, { stars: 5 })
    expect(s).toMatchObject({ moodScore: 100, totalScore: 70, tier: 'WATCH' })
    expect(await prisma.scoreSnapshot.count({ where: { userId } })).toBe(1)
  })
  it('checkinDate 按北京时间：23:59 与次日 00:01 归入两天', async () => {
    clock.set(new Date('2026-10-31T15:59:00Z'))
    await svc.create(userId, { stars: 3 })
    clock.set(new Date('2026-10-31T16:01:00Z'))
    await svc.create(userId, { stars: 3 })
    const daily = await svc.daily(userId, 30)
    expect(daily.map((d) => d.date)).toEqual(['2026-10-31', '2026-11-01'])
  })
  it('daily：同一天多次打卡合并为均值与次数，不含 age 字段', async () => {
    await svc.create(userId, { stars: 1 })
    await svc.create(userId, { stars: 2 })
    await svc.create(userId, { stars: 2 })
    expect(await svc.daily(userId, 30)).toEqual([{ date: '2026-10-31', avg: 16.67, count: 3 }])
  })
  it('daily：days 控制窗口', async () => {
    clock.set(new Date('2026-10-24T04:00:00Z'))
    await svc.create(userId, { stars: 3 }) // 距 10-31 为 7 天
    clock.set(new Date('2026-10-31T04:00:00Z'))
    expect(await svc.daily(userId, 7)).toEqual([])
    expect(await svc.daily(userId, 8)).toHaveLength(1)
  })
  it('byDate：当天明细按时间升序，备注原样保留（含 emoji）', async () => {
    await svc.create(userId, { stars: 2, note: '又加班🙃' })
    clock.set(new Date('2026-10-31T05:00:00Z'))
    await svc.create(userId, { stars: 4 })
    const items = await svc.byDate(userId, '2026-10-31')
    expect(items.map((i) => [i.stars, i.note])).toEqual([[2, '又加班🙃'], [4, null]])
    expect(typeof items[0]!.createdAt).toBe('string')
  })
  it('只看自己的数据', async () => {
    const other = (await prisma.user.create({ data: { openid: 'mock_o' } })).id
    await prisma.baseline.create({ data: { userId: other, ...ALL3 } })
    await svc.create(other, { stars: 5 })
    expect(await svc.daily(userId, 30)).toEqual([])
    expect(await svc.byDate(userId, '2026-10-31')).toEqual([])
  })
})

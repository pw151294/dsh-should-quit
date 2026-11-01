import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { truncateAll } from './setup/test-db.js'
import { ALL3, createTestApp, loginAs, type TestApp } from './helpers.js'

let t: TestApp

beforeAll(async () => { t = await createTestApp() })
afterAll(() => t?.close())
beforeEach(async () => {
  await truncateAll(t.app.get(PrismaService))
  t.clock.set(new Date('2026-10-31T04:00:00Z'))
})

describe('主流程', () => {
  it('登录 → 409 → 录入基准 → 打卡 → 评分 → 趋势', async () => {
    const { authorization } = await loginAs(t, 'alice')

    const first = await t.http().post('/api/auth/login').send({ code: 'alice' }).expect(200)
    expect(first.body.hasBaseline).toBe(false)

    const blocked = await t.http().get('/api/score/current').set({ authorization }).expect(409)
    expect(blocked.body).toEqual({ code: 'BASELINE_REQUIRED', message: expect.any(String) })

    expect((await t.http().get('/api/baseline').set({ authorization }).expect(200)).body).toEqual({ baseline: null })

    const saved = await t.http().put('/api/baseline').set({ authorization }).send(ALL3).expect(200)
    expect(saved.body).toMatchObject({ totalScore: 50, tier: 'SEEK', moodScore: null })
    expect(saved.body.copy.slogan).toBe('骑驴找马，悄悄看机会')

    const mood = await t.http().post('/api/moods').set({ authorization }).send({ stars: 5, note: '摸鱼🐟' }).expect(201)
    expect(mood.body).toMatchObject({ totalScore: 70, moodScore: 100 })

    const today = await t.http().get('/api/moods').query({ date: '2026-10-31' }).set({ authorization }).expect(200)
    expect(today.body).toHaveLength(1)
    expect(today.body[0]).toMatchObject({ stars: 5, note: '摸鱼🐟' })

    const current = await t.http().get('/api/score/current').set({ authorization }).expect(200)
    expect(current.body.totalScore).toBe(70)

    const trend = await t.http().get('/api/score/trend').query({ range: '7d' }).set({ authorization }).expect(200)
    expect(trend.body).toEqual({ before: null, items: [expect.objectContaining({ date: '2026-10-31', totalScore: 70 })] })

    const relogin = await t.http().post('/api/auth/login').send({ code: 'alice' }).expect(200)
    expect(relogin.body.hasBaseline).toBe(true)
  })
})

describe('鉴权与隔离', () => {
  it('缺少或伪造 token → 401 UNAUTHORIZED', async () => {
    const r1 = await t.http().get('/api/baseline').expect(401)
    expect(r1.body.code).toBe('UNAUTHORIZED')
    const r2 = await t.http().get('/api/baseline').set({ authorization: 'Bearer not-a-jwt' }).expect(401)
    expect(r2.body.code).toBe('UNAUTHORIZED')
  })
  it('A 的打卡不影响 B 的评分', async () => {
    const a = await loginAs(t, 'a')
    const b = await loginAs(t, 'b')
    for (const u of [a, b]) await t.http().put('/api/baseline').set({ authorization: u.authorization }).send(ALL3).expect(200)
    await t.http().post('/api/moods').set({ authorization: a.authorization }).send({ stars: 5 }).expect(201)
    const rb = await t.http().get('/api/score/current').set({ authorization: b.authorization }).expect(200)
    expect(rb.body.moodScore).toBeNull()
  })
})

describe('时区', () => {
  it('北京时间 23:59 与次日 00:01 的打卡归入不同两天', async () => {
    const { authorization } = await loginAs(t, 'tz')
    await t.http().put('/api/baseline').set({ authorization }).send(ALL3).expect(200)
    t.clock.set(new Date('2026-10-31T15:59:00Z'))
    await t.http().post('/api/moods').set({ authorization }).send({ stars: 1 }).expect(201)
    t.clock.set(new Date('2026-10-31T16:01:00Z'))
    await t.http().post('/api/moods').set({ authorization }).send({ stars: 5 }).expect(201)
    const daily = await t.http().get('/api/moods/daily').query({ days: 7 }).set({ authorization }).expect(200)
    expect(daily.body).toEqual([
      { date: '2026-10-31', avg: 0, count: 1 },
      { date: '2026-11-01', avg: 100, count: 1 },
    ])
  })
})

describe('参数校验', () => {
  it('非法基准、星级、日期、range → 400 VALIDATION_FAILED', async () => {
    const { authorization } = await loginAs(t, 'v')
    await t.http().put('/api/baseline').set({ authorization }).send({ ...ALL3, salary: 6 }).expect(400)
    await t.http().put('/api/baseline').set({ authorization }).send(ALL3).expect(200)
    const cases = [
      t.http().post('/api/moods').set({ authorization }).send({ stars: 0 }),
      t.http().post('/api/moods').set({ authorization }).send({ stars: 3, note: '字'.repeat(201) }),
      t.http().get('/api/moods').query({ date: '2026-02-30' }).set({ authorization }),
      t.http().get('/api/score/trend').query({ range: '1y' }).set({ authorization }),
    ]
    for (const r of await Promise.all(cases)) {
      expect(r.status).toBe(400)
      expect(r.body.code).toBe('VALIDATION_FAILED')
    }
  })
  it('mock 模式 code 超过 59 字符被拒绝', async () => {
    const r = await t.http().post('/api/auth/login').send({ code: 'x'.repeat(60) }).expect(400)
    expect(r.body.code).toBe('VALIDATION_FAILED')
  })
})

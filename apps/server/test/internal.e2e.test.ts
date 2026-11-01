import { afterAll, beforeAll, expect, it } from 'vitest'
import { Clock } from '../src/clock.js'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { InternalModule } from '../src/internal/internal.module.js'
import { ErrorFilter } from '../src/common/error.filter.js'
import { ENV, type Env } from '../src/env.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { createTestApp, loginAs, ALL3, type TestApp } from './helpers.js'
let internal: INestApplication, t: TestApp, token: string, db: PrismaService
beforeAll(async () => {
  t = await createTestApp()
  const ref = await Test.createTestingModule({ imports: [InternalModule] }).overrideProvider(Clock).useValue(t.clock).compile()
  internal = ref.createNestApplication(); internal.useGlobalFilters(new ErrorFilter()); await internal.init()
  token = internal.get<Env>(ENV).INTERNAL_TOKEN; db = internal.get(PrismaService)
  await db.agentMessage.deleteMany(); await db.agentConversation.deleteMany()
})
afterAll(async () => { await internal.close(); await t.close() })
it('token and current session mapping are mandatory', async () => {
  const a = await loginAs(t, 'internal-owner')
  await t.http().put('/api/baseline').set('Authorization', a.authorization).send(ALL3)
  const c = await db.agentConversation.create({ data: { userId: a.userId, dshSessionId: 'internal-old' } })
  const url = '/internal/agent-tools/get_score_summary'
  await request(internal.getHttpServer()).post(url).send({ sessionId: 'internal-old', args: {} }).expect(403)
  const call = (sessionId: string, args = {}) => request(internal.getHttpServer()).post(url)
    .set('X-Internal-Token', token).send({ sessionId, args })
  expect((await call('internal-old').expect(201)).body.totalScore).toBe(50)
  await call('internal-old', { userId: 'another-user' }).expect(400)
  await db.agentConversation.update({ where: { id: c.id }, data: { dshSessionId: 'internal-new' } })
  await call('internal-old').expect(403); await call('internal-new').expect(201)
  await t.http().post(url).set('Authorization', a.authorization).send({}).expect(404)
})
it('validates tool arguments before requiring baseline', async () => {
  const a = await loginAs(t, 'internal-no-baseline')
  await db.agentConversation.create({ data: { userId: a.userId, dshSessionId: 'internal-empty' } })
  for (const [tool, args] of [['get_mood_history', { days: 0 }], ['get_score_trend', { range: '1d' }], ['unknown', {}]]) {
    await request(internal.getHttpServer()).post(`/internal/agent-tools/${tool}`)
      .set('X-Internal-Token', token).send({ sessionId: 'internal-empty', args }).expect(400)
  }
  await request(internal.getHttpServer()).post('/internal/agent-tools/get_score_summary')
    .set('X-Internal-Token', token).send({ sessionId: 'internal-empty', args: {} }).expect(409)
})
it('scopes notes and daily windows, limits notes, and performs no writes', async () => {
  const a = await loginAs(t, 'internal-history'), b = await loginAs(t, 'internal-other')
  for (const u of [a, b]) await t.http().put('/api/baseline').set('Authorization', u.authorization).send(ALL3).expect(200)
  await db.agentConversation.create({ data: { userId: a.userId, dshSessionId: 'internal-history' } })
  const today = new Date('2026-10-31T00:00:00Z')
  await db.moodCheckin.createMany({ data: [
    ...Array.from({ length: 22 }, (_, i) => ({ id: `${a.userId}-${String(i).padStart(2, '0')}`, userId: a.userId, stars: 3, note: `note-${i}`, checkinDate: today, createdAt: today })),
    { userId: a.userId, stars: 1, note: 'old', checkinDate: new Date('2026-08-03'), createdAt: new Date('2026-08-03') },
    { userId: b.userId, stars: 5, note: 'private', checkinDate: today, createdAt: today },
  ] })
  const snapshot = async () => JSON.stringify(await Promise.all([db.baseline.findMany(), db.moodCheckin.findMany(), db.scoreSnapshot.findMany(), db.agentConversation.findMany()]))
  const before = await snapshot()
  const call = (tool: string, args: unknown) => request(internal.getHttpServer()).post(`/internal/agent-tools/${tool}`)
    .set('X-Internal-Token', token).send({ sessionId: 'internal-history', args })
  for (const days of [1, 30, 90]) {
    const r = await call('get_mood_history', { days }).expect(201)
    expect(r.body.daily.length).toBeGreaterThan(0)
    expect(r.body.notes).toHaveLength(20)
    expect(r.body.notes[0].note).toBe('note-21')
    expect(JSON.stringify(r.body)).not.toContain('private')
  }
  expect((await call('get_mood_history', {}).expect(201)).body.daily).toEqual((await call('get_mood_history', { days: 30 }).expect(201)).body.daily)
  for (const days of [0, 91, 1.5, '30']) await call('get_mood_history', { days }).expect(400)
  await call('get_baseline', {}).expect(201)
  await call('get_score_trend', {}).expect(201)
  expect(await snapshot()).toBe(before)
})

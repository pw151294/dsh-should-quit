// apps/server/test/helpers.ts
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { Clock, FixedClock } from '../src/clock.js'
import { configureApp } from '../src/setup.js'

export interface TestApp {
  app: INestApplication
  clock: FixedClock
  http: () => ReturnType<typeof request>
  close: () => Promise<void>
}

/** 默认时间：2026-10-31 12:00 北京时间 */
export async function createTestApp(at = new Date('2026-10-31T04:00:00Z')): Promise<TestApp> {
  const clock = new FixedClock(at)
  const ref = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock).useValue(clock)
    .compile()
  const app = ref.createNestApplication({ bufferLogs: true })
  configureApp(app)
  await app.init()
  return { app, clock, http: () => request(app.getHttpServer()), close: () => app.close() }
}

/** mock 登录，返回 Bearer 头 */
export async function loginAs(t: TestApp, code: string): Promise<{ authorization: string; userId: string }> {
  const r = await t.http().post('/api/auth/login').send({ code }).expect(200)
  return { authorization: `Bearer ${r.body.token as string}`, userId: r.body.user.id as string }
}

export const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 }

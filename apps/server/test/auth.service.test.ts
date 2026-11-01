import { JwtService } from '@nestjs/jwt'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthService } from '../src/auth/auth.service.js'
import type { WechatClient } from '../src/auth/wechat.client.js'
import { AppError } from '../src/common/app-error.js'
import { loadEnv } from '../src/env.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
const jwt = new JwtService({ secret: 'j'.repeat(32), signOptions: { expiresIn: '7d' } })
const fakeWechat: WechatClient = {
  async code2session(code) {
    if (code === 'bad') throw new AppError('WECHAT_LOGIN_FAILED', '微信登录失败')
    return { openid: `wx_${code}` }
  },
}

function service(mode: 'mock' | 'wechat'): AuthService {
  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: 'j'.repeat(32),
    INTERNAL_TOKEN: 'i'.repeat(32),
    AUTH_MODE: mode,
    WECHAT_APPID: 'wx1',
    WECHAT_SECRET: 's',
  })
  return new AuthService(env, prisma as never, jwt, fakeWechat)
}

describe('AuthService', () => {
  beforeEach(() => truncateAll(prisma))
  afterAll(() => prisma.$disconnect())

  it('mock：openid = mock_<code>，首次登录建用户，hasBaseline=false', async () => {
    const r = await service('mock').login('alice')
    const u = await prisma.user.findUniqueOrThrow({ where: { openid: 'mock_alice' } })
    expect(r.user.id).toBe(u.id)
    expect(r.hasBaseline).toBe(false)
    expect(jwt.verify<{ sub: string }>(r.token).sub).toBe(u.id)
  })
  it('同一 code 再次登录复用用户', async () => {
    const a = await service('mock').login('alice')
    const b = await service('mock').login('alice')
    expect(b.user.id).toBe(a.user.id)
    expect(await prisma.user.count()).toBe(1)
  })
  it('同一 code 并发首登：全部成功且只建一个用户', async () => {
    const svc = service('mock')
    const rs = await Promise.all(Array.from({ length: 8 }, () => svc.login('carol')))
    expect(new Set(rs.map((r) => r.user.id)).size).toBe(1)
    expect(await prisma.user.count()).toBe(1)
  })
  it('已录入基准时 hasBaseline=true', async () => {
    const { user } = await service('mock').login('bob')
    await prisma.baseline.create({
      data: { userId: user.id, salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 },
    })
    expect((await service('mock').login('bob')).hasBaseline).toBe(true)
  })
  it('wechat：用 code2session 返回的 openid', async () => {
    await service('wechat').login('c1')
    expect(await prisma.user.count({ where: { openid: 'wx_c1' } })).toBe(1)
  })
  it('wechat：code2session 失败抛 WECHAT_LOGIN_FAILED', async () => {
    await expect(service('wechat').login('bad')).rejects.toMatchObject({ code: 'WECHAT_LOGIN_FAILED' })
  })
})

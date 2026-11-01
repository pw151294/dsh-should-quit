import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env.js'

const BASE = {
  DATABASE_URL: 'mysql://root:@127.0.0.1:3306/should_quit_test',
  JWT_SECRET: 'x'.repeat(32),
  INTERNAL_TOKEN: 'y'.repeat(32),
}

describe('loadEnv', () => {
  it('最小配置通过，其余取默认值', () => {
    const env = loadEnv(BASE)
    expect(env.PORT).toBe(3000)
    expect(env.INTERNAL_PORT).toBe(3100)
    expect(env.AUTH_MODE).toBe('mock')
    expect(env.AGENT_ENGINE).toBe('fake')
  })
  it('端口从字符串转数字', () => {
    expect(loadEnv({ ...BASE, PORT: '8080' }).PORT).toBe(8080)
  })
  it('密钥不足 32 字符时拒绝，错误信息带字段名但不带值', () => {
    expect(() => loadEnv({ ...BASE, JWT_SECRET: 'short-secret' })).toThrow(/JWT_SECRET/)
    expect(() => loadEnv({ ...BASE, JWT_SECRET: 'short-secret' })).not.toThrow(/short-secret/)
  })
  it('连接串必须是 mysql://', () => {
    expect(() => loadEnv({ ...BASE, DATABASE_URL: 'postgres://x' })).toThrow(/DATABASE_URL/)
  })
  it('wechat 模式必须配置 AppID 与 Secret', () => {
    expect(() => loadEnv({ ...BASE, AUTH_MODE: 'wechat' })).toThrow(/WECHAT_APPID/)
    expect(loadEnv({ ...BASE, AUTH_MODE: 'wechat', WECHAT_APPID: 'wx1', WECHAT_SECRET: 's' }).AUTH_MODE).toBe('wechat')
  })
  it('production 环境禁止 mock 登录（任何 code 都能换到 token）', () => {
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/AUTH_MODE/)
  })
})

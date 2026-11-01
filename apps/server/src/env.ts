// apps/server/src/env.ts
import { z } from 'zod'

const secret = z.string().min(32, '至少 32 个字符（openssl rand -hex 32）')

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().startsWith('mysql://', '必须以 mysql:// 开头'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    INTERNAL_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
    INTERNAL_TOKEN: secret,
    JWT_SECRET: secret,
    AUTH_MODE: z.enum(['mock', 'wechat']).default('mock'),
    WECHAT_APPID: z.string().optional(),
    WECHAT_SECRET: z.string().optional(),
    AGENT_ENGINE: z.enum(['fake', 'dsh-tools', 'dsh-context']).default('fake'),
    DEEPSEEK_API_KEY: z.string().optional(),
    DSH_HOME_DIR: z.string().default('./var/dsh-home'),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && e.AUTH_MODE === 'mock') {
      ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'production 环境不允许 mock 登录' })
    }
    if (e.AGENT_ENGINE !== 'fake' && !e.DEEPSEEK_API_KEY?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['DEEPSEEK_API_KEY'], message: '真实引擎必须配置API Key' })
    }
    if (e.AUTH_MODE === 'wechat') {
      for (const k of ['WECHAT_APPID', 'WECHAT_SECRET'] as const) {
        if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'AUTH_MODE=wechat 时必填' })
      }
    }
  })

export type Env = z.infer<typeof schema>

/** Nest 注入令牌 */
export const ENV = Symbol('ENV')

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const r = schema.safeParse(source)
  if (!r.success) {
    const lines = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`环境变量校验失败：\n${lines.join('\n')}`)
  }
  return r.data
}

// apps/server/src/auth/wechat.client.ts
import { Inject, Injectable } from '@nestjs/common'
import { AppError } from '../common/app-error.js'
import { ENV, type Env } from '../env.js'

export abstract class WechatClient {
  abstract code2session(code: string): Promise<{ openid: string }>
}

@Injectable()
export class HttpWechatClient extends WechatClient {
  constructor(@Inject(ENV) private readonly env: Env) {
    super()
  }

  async code2session(code: string): Promise<{ openid: string }> {
    // URLSearchParams 负责转义，code 不直接拼进 URL
    const qs = new URLSearchParams({
      appid: this.env.WECHAT_APPID ?? '',
      secret: this.env.WECHAT_SECRET ?? '',
      js_code: code,
      grant_type: 'authorization_code',
    })
    let data: { openid?: string; errcode?: number }
    try {
      const res = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${qs}`, { signal: AbortSignal.timeout(5000) })
      data = (await res.json()) as typeof data
    } catch {
      throw new AppError('WECHAT_LOGIN_FAILED', '微信登录失败，请稍后再试')
    }
    // 不记录、不返回 session_key；MVP 用不到
    if (!data.openid || data.errcode) throw new AppError('WECHAT_LOGIN_FAILED', '微信登录失败，请重试')
    return { openid: data.openid }
  }
}

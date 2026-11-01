// apps/server/src/auth/auth.service.ts
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { LoginResponse } from '@should-quit/shared'
import { ENV, type Env } from '../env.js'
import { hasPrismaCode } from '../prisma/errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { WechatClient } from './wechat.client.js'

export interface JwtPayload { sub: string }

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wechat: WechatClient,
  ) {}

  async login(code: string): Promise<LoginResponse> {
    const openid = this.env.AUTH_MODE === 'mock' ? `mock_${code}` : (await this.wechat.code2session(code)).openid
    // MySQL 上 upsert 是先查后插，并发首登可能撞唯一索引，冲突时回读
    let user
    try {
      user = await this.prisma.user.upsert({ where: { openid }, create: { openid }, update: {} })
    } catch (e) {
      if (!hasPrismaCode(e, 'P2002')) throw e
      user = await this.prisma.user.findUniqueOrThrow({ where: { openid } })
    }
    const baseline = await this.prisma.baseline.findUnique({ where: { userId: user.id }, select: { userId: true } })
    const payload: JwtPayload = { sub: user.id }
    return {
      token: await this.jwt.signAsync(payload),
      user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl },
      hasBaseline: baseline !== null,
    }
  }
}

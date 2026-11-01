// apps/server/src/auth/auth.guard.ts
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { AppError } from '../common/app-error.js'
import type { JwtPayload } from './auth.service.js'
import { IS_PUBLIC } from './decorators.js'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>()
    const [scheme, token] = (req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw new AppError('UNAUTHORIZED', '请先登录')
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token)
      if (typeof payload.sub !== 'string') throw new Error('bad payload')
      req.user = { sub: payload.sub }
      return true
    } catch {
      throw new AppError('UNAUTHORIZED', '登录已过期，请重新登录')
    }
  }
}

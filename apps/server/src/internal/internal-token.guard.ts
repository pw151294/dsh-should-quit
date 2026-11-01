import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { ENV, type Env } from '../env.js'
import { AppError } from '../common/app-error.js'
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}
  canActivate(ctx: ExecutionContext): boolean {
    const raw: unknown = ctx.switchToHttp().getRequest().headers['x-internal-token']
    const expected = Buffer.from(this.env.INTERNAL_TOKEN)
    const actual = Buffer.from(typeof raw === 'string' ? raw : '')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new AppError('FORBIDDEN', '禁止访问')
    }
    return true
  }
}

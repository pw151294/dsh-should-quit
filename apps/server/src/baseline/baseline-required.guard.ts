// apps/server/src/baseline/baseline-required.guard.ts
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { AppError } from '../common/app-error.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** 未完成首次基准录入时返回 409 BASELINE_REQUIRED。必须在全局 AuthGuard 之后运行（Nest 先跑全局守卫） */
@Injectable()
export class BaselineRequiredGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const userId = ctx.switchToHttp().getRequest<{ user?: { sub: string } }>().user?.sub
    // 守卫顺序配错或 @Public 路由误挂时 req.user 为空，按未登录处理而非 500
    if (!userId) throw new AppError('UNAUTHORIZED', '请先登录')
    const hit = await this.prisma.baseline.findUnique({ where: { userId }, select: { userId: true } })
    if (!hit) throw new AppError('BASELINE_REQUIRED', '请先完成工作基准录入')
    return true
  }
}

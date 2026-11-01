// apps/server/src/auth/decorators.ts
import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common'
import { AppError } from '../common/app-error.js'

export const IS_PUBLIC = 'isPublic'
/** 跳过全局 JWT 守卫 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true)

/** 当前登录用户 id（由 AuthGuard 写入 req.user） */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const user = ctx.switchToHttp().getRequest<{ user?: { sub: string } }>().user
  // @Public 路由误用 @UserId 时 req.user 为空，按未登录处理而非 500
  if (!user) throw new AppError('UNAUTHORIZED', '请先登录')
  return user.sub
})

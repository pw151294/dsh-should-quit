import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { BaselineRequiredGuard } from '../src/baseline/baseline-required.guard.js'

function ctxWith(req: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

describe('BaselineRequiredGuard', () => {
  it('req.user 缺失 → UNAUTHORIZED', async () => {
    const guard = new BaselineRequiredGuard({} as never)
    await expect(guard.canActivate(ctxWith({}))).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: '请先登录' })
  })
})

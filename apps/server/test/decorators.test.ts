import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UserId } from '../src/auth/decorators.js'
import { ErrorFilter } from '../src/common/error.filter.js'

@Controller('d')
class TestController {
  // 未挂 AuthGuard，req.user 不存在
  @Get('me') me(@UserId() id: string): { id: string } { return { id } }
}

@Module({ controllers: [TestController] })
class TestModule {}

describe('@UserId()', () => {
  let app: INestApplication
  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [TestModule] }).compile()
    app = ref.createNestApplication({ logger: false })
    app.useGlobalFilters(new ErrorFilter())
    await app.init()
  })
  afterAll(() => app.close())

  it('req.user 缺失 → 401 UNAUTHORIZED', async () => {
    const r = await request(app.getHttpServer()).get('/d/me')
    expect(r.status).toBe(401)
    expect(r.body).toEqual({ code: 'UNAUTHORIZED', message: '请先登录' })
  })
})

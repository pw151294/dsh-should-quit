import { Body, Controller, Get, Logger, Module, Post, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AppError } from '../src/common/app-error.js'
import { ErrorFilter } from '../src/common/error.filter.js'
import { ZodPipe } from '../src/common/zod.pipe.js'

const bodySchema = z.object({ n: z.number().int() })

@Controller('t')
class TestController {
  @Get('app') app(): never { throw new AppError('BASELINE_REQUIRED', '请先完成基准录入') }
  @Get('boom') boom(): never { throw new Error('db password=secret leaked') }
  @Get('prisma') prisma(): never {
    const e = new Error('Invalid `user.create()` invocation: { openid: "SECRET_OPENID_123" }')
    Object.assign(e, { name: 'PrismaClientKnownRequestError', code: 'P2002', meta: { target: 'User_openid_key' } })
    throw e
  }
  @Post('zod') zod(@Body(new ZodPipe(bodySchema)) b: { n: number }): { n: number } { return b }
}

@Module({ controllers: [TestController] })
class TestModule {}

describe('ErrorFilter / ZodPipe', () => {
  let app: INestApplication
  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [TestModule] }).compile()
    app = ref.createNestApplication({ logger: false })
    app.useGlobalFilters(new ErrorFilter())
    await app.init()
  })
  afterAll(() => app.close())

  it('AppError → 对照表中的状态码与 {code, message}', async () => {
    const r = await request(app.getHttpServer()).get('/t/app')
    expect(r.status).toBe(409)
    expect(r.body).toEqual({ code: 'BASELINE_REQUIRED', message: '请先完成基准录入' })
  })
  it('未预期异常 → 500 INTERNAL_ERROR，不泄露原始信息', async () => {
    const r = await request(app.getHttpServer()).get('/t/boom')
    expect(r.status).toBe(500)
    expect(r.body.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(r.body)).not.toContain('secret')
  })
  it('Prisma 错误只记录 name/code/target，不记录含参数的 message', async () => {
    const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    try {
      const r = await request(app.getHttpServer()).get('/t/prisma')
      expect(r.status).toBe(500)
      expect(r.body).toEqual({ code: 'INTERNAL_ERROR', message: '服务开小差了，请稍后再试' })
      expect(spy).toHaveBeenCalledTimes(1)
      const logged = JSON.stringify(spy.mock.calls[0])
      expect(logged).not.toContain('SECRET_OPENID_123')
      expect(logged).toContain('P2002')
      expect(logged).toContain('User_openid_key')
    } finally {
      spy.mockRestore()
    }
  })
  it('非 Prisma 未预期异常不记录敏感 stack', async () => {
    const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    try {
      await request(app.getHttpServer()).get('/t/boom')
      expect(JSON.stringify(spy.mock.calls[0]?.[0])).not.toContain('secret')
      expect(spy.mock.calls[0]?.[0]).toEqual({ name: 'Error' })
    } finally {
      spy.mockRestore()
    }
  })
  it('路由不存在 → 404 NOT_FOUND', async () => {
    const r = await request(app.getHttpServer()).get('/nope')
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('NOT_FOUND')
  })
  it('zod 校验失败 → 400 VALIDATION_FAILED，message 带字段路径', async () => {
    const r = await request(app.getHttpServer()).post('/t/zod').send({ n: 1.5 })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('VALIDATION_FAILED')
    expect(r.body.message).toMatch(/n/)
  })
  it('zod 校验通过时返回解析后的值', async () => {
    const r = await request(app.getHttpServer()).post('/t/zod').send({ n: 2 })
    expect(r.status).toBe(201)
    expect(r.body).toEqual({ n: 2 })
  })
})

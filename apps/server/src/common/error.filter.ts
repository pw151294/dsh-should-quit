// apps/server/src/common/error.filter.ts
import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import type { ErrorBody, ErrorCode } from '@should-quit/shared'
import { AppError } from './app-error.js'

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'AGENT_BUSY',
  429: 'RATE_LIMITED',
  503: 'AGENT_RESTARTING',
}

// Prisma 错误的 message/stack 含查询参数（用户数据），只记录 name/code/target
function describeForLog(err: unknown): unknown {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined
  if (typeof name === 'string' && name.startsWith('PrismaClient')) {
    const e = err as { code?: unknown; meta?: { target?: unknown } }
    return { name, code: e.code, target: e.meta?.target }
  }
  return { name: typeof name === 'string' ? name : 'UnknownError' }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter')

  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>()
    // SSE 已开始推流时不能再写 JSON；由 AgentService 自己发 error 事件（Phase 4）
    if (res.headersSent) return

    let status = 500
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: '服务开小差了，请稍后再试' }

    if (err instanceof AppError) {
      status = err.status
      body = { code: err.code, message: err.message }
    } else if (err instanceof HttpException) {
      status = err.getStatus()
      const code = STATUS_TO_CODE[status]
      if (code) body = { code, message: err.message }
    }

    if (status >= 500 && !(err instanceof AppError)) {
      this.logger.error(describeForLog(err))
    }
    res.status(status).json(body)
  }
}

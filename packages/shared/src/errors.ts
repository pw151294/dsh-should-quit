// packages/shared/src/errors.ts
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  WECHAT_LOGIN_FAILED: 'WECHAT_LOGIN_FAILED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BASELINE_REQUIRED: 'BASELINE_REQUIRED',
  AGENT_BUSY: 'AGENT_BUSY',
  RATE_LIMITED: 'RATE_LIMITED',
  AGENT_RESTARTING: 'AGENT_RESTARTING',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/** null 表示只通过 SSE error 事件下发，不作为 HTTP 响应 */
export const errorHttpStatus: Record<ErrorCode, number | null> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  WECHAT_LOGIN_FAILED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BASELINE_REQUIRED: 409,
  AGENT_BUSY: 409,
  RATE_LIMITED: 429,
  AGENT_RESTARTING: 503,
  INTERNAL_ERROR: 500,
  AGENT_UNAVAILABLE: null,
  AGENT_TIMEOUT: null,
}

export interface ErrorBody {
  code: ErrorCode
  message: string
}

export function isErrorBody(v: unknown): v is ErrorBody {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.code === 'string'
    && Object.prototype.hasOwnProperty.call(ErrorCode, o.code)
    && typeof o.message === 'string'
}

// apps/server/src/common/app-error.ts
import { ErrorCode, errorHttpStatus } from '@should-quit/shared'

/** 业务错误：code 决定 HTTP 状态（见 shared errorHttpStatus） */
export class AppError extends Error {
  readonly status: number
  constructor(readonly code: ErrorCode, message: string) {
    super(message)
    // AGENT_UNAVAILABLE / AGENT_TIMEOUT 只走 SSE；若被误抛成 HTTP 异常，按 500 处理
    this.status = errorHttpStatus[code] ?? 500
  }
}

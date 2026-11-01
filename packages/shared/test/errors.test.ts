import { describe, expect, it } from 'vitest'
import { ErrorCode, errorHttpStatus, isErrorBody } from '../src/errors.js'

describe('errors', () => {
  it('包含设计文档 §5 的全部 12 个错误码', () => {
    expect(Object.keys(ErrorCode).sort()).toEqual([
      'AGENT_BUSY', 'AGENT_RESTARTING', 'AGENT_TIMEOUT', 'AGENT_UNAVAILABLE', 'BASELINE_REQUIRED',
      'FORBIDDEN', 'INTERNAL_ERROR', 'NOT_FOUND', 'RATE_LIMITED', 'UNAUTHORIZED', 'VALIDATION_FAILED',
      'WECHAT_LOGIN_FAILED',
    ])
  })
  it('键与值相同', () => {
    for (const [k, v] of Object.entries(ErrorCode)) expect(v).toBe(k)
  })
  it('HTTP 状态对照', () => {
    expect(errorHttpStatus.VALIDATION_FAILED).toBe(400)
    expect(errorHttpStatus.UNAUTHORIZED).toBe(401)
    expect(errorHttpStatus.WECHAT_LOGIN_FAILED).toBe(401)
    expect(errorHttpStatus.FORBIDDEN).toBe(403)
    expect(errorHttpStatus.NOT_FOUND).toBe(404)
    expect(errorHttpStatus.BASELINE_REQUIRED).toBe(409)
    expect(errorHttpStatus.AGENT_BUSY).toBe(409)
    expect(errorHttpStatus.RATE_LIMITED).toBe(429)
    expect(errorHttpStatus.AGENT_RESTARTING).toBe(503)
    expect(errorHttpStatus.INTERNAL_ERROR).toBe(500)
    expect(errorHttpStatus.AGENT_UNAVAILABLE).toBeNull()
    expect(errorHttpStatus.AGENT_TIMEOUT).toBeNull()
  })
  it('isErrorBody 识别 {code, message}', () => {
    expect(isErrorBody({ code: 'NOT_FOUND', message: 'x' })).toBe(true)
    expect(isErrorBody({ code: 'WHATEVER', message: 'x' })).toBe(false)
    expect(isErrorBody({ code: 'NOT_FOUND' })).toBe(false)
    expect(isErrorBody(null)).toBe(false)
  })
})

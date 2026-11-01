import Taro from '@tarojs/taro'
import { isErrorBody } from '@should-quit/shared'
import { useAuth } from '../stores/auth'
import { ensureLogin, goBaseline, login } from './auth'
export interface RequestOptions { method?: 'GET' | 'POST' | 'PUT'; data?: unknown }
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
export function responseError(status: number, data: unknown): ApiError {
  return new ApiError(status, isErrorBody(data) ? data.code : 'INTERNAL_ERROR',
    isErrorBody(data) ? data.message : '请求失败，请稍后重试')
}
export async function reportError(error: ApiError): Promise<never> {
  if (error.code === 'BASELINE_REQUIRED') { useAuth.getState().setBaseline(false); await goBaseline() }
  else await Taro.showToast({ title: error.message, icon: 'none' })
  throw error
}
export async function refreshAfter401(sentToken: string): Promise<void> {
  // 另一个并发请求已经换好token时，无需再次登录。
  if (useAuth.getState().token === sentToken) await login()
}
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  await ensureLogin()
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = useAuth.getState().token
    let r: Taro.request.SuccessCallbackResult<T>
    try {
      r = await Taro.request<T>({ url: API_BASE_URL + path, method: options.method ?? 'GET',
        data: options.data, header: { Authorization: 'Bearer ' + token } })
    } catch {
      return reportError(new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请重试'))
    }
    if (r.statusCode >= 200 && r.statusCode < 300) return r.data
    if (r.statusCode === 401 && attempt === 0) { await refreshAfter401(token); continue }
    return reportError(responseError(r.statusCode, r.data))
  }
  throw new Error('unreachable')
}

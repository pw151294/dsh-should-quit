import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ request: vi.fn(), login: vi.fn(), toast: vi.fn(), reLaunch: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: {
  request: mock.request, login: mock.login, showToast: mock.toast, reLaunch: mock.reLaunch,
  getStorageSync: () => '', setStorageSync: vi.fn(),
} }))
import { request } from '../src/services/request'
import { useAuth } from '../src/stores/auth'
beforeEach(() => {
  vi.clearAllMocks()
  useAuth.setState({ token: 'old', user: { id: 'a', nickname: null, avatarUrl: null }, hasBaseline: true })
  mock.login.mockResolvedValue({ code: 'code' }); mock.toast.mockResolvedValue({}); mock.reLaunch.mockResolvedValue({})
})
it('concurrent 401 refreshes once and retries with new token', async () => {
  mock.request.mockImplementation(async (options: { url: string; header?: { Authorization: string } }) => {
    if (options.url.endsWith('/auth/login')) return { statusCode: 200, data: {
      token: 'new', user: { id: 'a', nickname: null, avatarUrl: null }, hasBaseline: true,
    } }
    return options.header?.Authorization === 'Bearer old'
      ? { statusCode: 401, data: { code: 'UNAUTHORIZED', message: '过期' } }
      : { statusCode: 200, data: { ok: true } }
  })
  expect(await Promise.all([request('/score/current'), request('/score/current')])).toEqual([{ ok: true }, { ok: true }])
  expect(mock.login).toHaveBeenCalledTimes(1)
})
it('login 401 stops, never recursively calls request recovery', async () => {
  useAuth.setState({ token: '', user: null })
  mock.request.mockResolvedValue({ statusCode: 401, data: { code: 'WECHAT_LOGIN_FAILED', message: '失败' } })
  await expect(request('/score/current')).rejects.toThrow('登录失败')
  expect(mock.login).toHaveBeenCalledTimes(1)
})
it('baseline error routes and retains the error code', async () => {
  mock.request.mockResolvedValue({ statusCode: 409, data: { code: 'BASELINE_REQUIRED', message: '先录入' } })
  await expect(request('/score/current')).rejects.toMatchObject({ code: 'BASELINE_REQUIRED' })
  expect(mock.reLaunch).toHaveBeenCalledTimes(1)
})
it('repeated unauthorized response stops after one retry', async () => {
  mock.request.mockImplementation(async (o: { url: string }) => o.url.endsWith('/auth/login')
    ? { statusCode: 200, data: { token: 'new', user: { id: 'a', nickname: null, avatarUrl: null }, hasBaseline: true } }
    : { statusCode: 401, data: { code: 'UNAUTHORIZED', message: '过期' } })
  await expect(request('/score/current')).rejects.toMatchObject({ status: 401 })
  expect(mock.request).toHaveBeenCalledTimes(3)
})
it.each([429, 503])('reports server message for %s', async statusCode => {
  mock.request.mockResolvedValue({ statusCode, data: { code: 'INTERNAL_ERROR', message: '稍后再试' } })
  await expect(request('/score/current')).rejects.toThrow('稍后再试')
  expect(mock.toast).toHaveBeenCalledWith({ title: '稍后再试', icon: 'none' })
})
it('network failure permits a later request', async () => {
  mock.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ statusCode: 200, data: 'ok' })
  await expect(request('/score/current')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  expect(await request('/score/current')).toBe('ok')
})
it('concurrent baseline failures navigate once', async () => {
  mock.request.mockResolvedValue({ statusCode: 409, data: { code: 'BASELINE_REQUIRED', message: '先录入' } })
  await Promise.allSettled([request('/score/current'), request('/score/current')])
  expect(mock.reLaunch).toHaveBeenCalledTimes(1)
})

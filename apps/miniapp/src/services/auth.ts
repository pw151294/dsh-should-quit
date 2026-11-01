import Taro from '@tarojs/taro'
import type { LoginResponse } from '@should-quit/shared'
import { useAuth } from '../stores/auth'
import { useScore } from '../stores/score'
import { useChat } from '../stores/chat'
let pending: Promise<LoginResponse> | undefined
export function login(): Promise<LoginResponse> {
  if (pending) return pending
  pending = (async () => {
    const { code } = await Taro.login()
    const r = await Taro.request<LoginResponse>({ url: API_BASE_URL + '/auth/login', method: 'POST',
      data: { code: (process.env.NODE_ENV === 'development' && MOCK_LOGIN_CODE) || code } })
    if (r.statusCode !== 200) throw new Error('登录失败')
    const oldUser = useAuth.getState().user
    if (!oldUser || oldUser.id !== r.data.user.id) { useScore.getState().setScore(null); useChat.getState().reset() }
    useAuth.getState().setLogin(r.data)
    return r.data
  })().catch(error => { void Taro.showToast({ title: '登录失败，请重试', icon: 'none' }); throw error })
    .finally(() => { pending = undefined })
  return pending
}
export async function ensureLogin(): Promise<LoginResponse> {
  if (pending) return pending
  const state = useAuth.getState()
  if (state.token && state.user) return { token: state.token, user: state.user, hasBaseline: state.hasBaseline }
  return login()
}
export async function guardPage(): Promise<boolean> {
  const state = await ensureLogin()
  if (!state.hasBaseline) { await goBaseline(); return false }
  return true
}
let routing: Promise<unknown> | undefined
export function goBaseline(): Promise<unknown> {
  if (!routing) routing = Taro.reLaunch({ url: '/pages/baseline/index' }).finally(() => { routing = undefined })
  return routing
}

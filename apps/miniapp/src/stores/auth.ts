import { create } from 'zustand'
import Taro from '@tarojs/taro'
import type { LoginResponse, UserView } from '@should-quit/shared'
interface AuthState {
  token: string; user: UserView | null; hasBaseline: boolean
  setLogin(value: LoginResponse): void; setBaseline(value: boolean): void
}
export const useAuth = create<AuthState>(set => ({
  token: Taro.getStorageSync('token') || '', user: null, hasBaseline: false,
  setLogin: value => { Taro.setStorageSync('token', value.token); set(value) },
  setBaseline: hasBaseline => set({ hasBaseline }),
}))

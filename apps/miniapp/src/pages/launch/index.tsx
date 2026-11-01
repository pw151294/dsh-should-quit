import { useState } from 'react'
import Taro, { useLoad } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { ensureLogin } from '../../services/auth'
export default function Launch() {
  const [failed, setFailed] = useState(false)
  const start = async () => {
    setFailed(false)
    try {
      const state = await ensureLogin()
      if (state.hasBaseline) await Taro.switchTab({ url: '/pages/home/index' })
      else await Taro.reLaunch({ url: '/pages/baseline/index' })
    } catch { setFailed(true) }
  }
  useLoad(() => { void start() })
  return <View className='screen'>{failed ? <Button onClick={() => void start()}>登录失败，点击重试</Button> : '正在登录…'}</View>
}

import Taro, { useDidShow } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { guardPage } from '../../services/auth'
export default function Mine() {
  useDidShow(() => { void guardPage().catch(() => {}) })
  return <View className='screen'><Button onClick={() => void Taro.navigateTo({ url: '/pages/baseline/index' })}>编辑基准</Button>
    <View className='card'><View className='title'>免责声明</View>评分仅供自我观察，不构成离职、法律或财务建议。请结合收入、机会与个人处境审慎决定。</View>
    <View className='card'><View className='title'>关于该溜吗</View>记录工作条件与心情变化，帮助你看清自己的感受。</View></View>
}

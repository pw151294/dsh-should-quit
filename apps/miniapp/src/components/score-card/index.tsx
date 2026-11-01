import { useState } from 'react'
import { Button, View } from '@tarojs/components'
import type { ScoreView } from '@should-quit/shared'
export default function ScoreCard({ score }: { score: ScoreView }) {
  const [open, setOpen] = useState(false)
  return <View className='card'><View className='score'>{score.totalScore}</View>
    <View>{score.copy.label}</View><View>{score.copy.slogan}</View>
    <View className='muted'>客观 {score.objectiveScore} · 心情 {score.moodScore ?? '暂无，去打卡'}</View>
    <Button onClick={() => setOpen(!open)}>{open ? '收起建议' : '查看详细建议'}</Button>
    {open && <View>{score.copy.guidance}</View>}</View>
}

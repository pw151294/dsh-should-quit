import { useEffect, useRef, useState } from 'react'
import { useDidShow, useDidHide, useShareAppMessage } from '@tarojs/taro'
import { Button, Textarea, View } from '@tarojs/components'
import { localDate, moodCreateSchema } from '@should-quit/shared'
import { createDayCount, singleFlight } from './model'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
import { useScore } from '../../stores/score'
import MoodStars from '../../components/mood-stars'
import ScoreCard from '../../components/score-card'
export default function Home() {
  const score = useScore(s => s.score)
  const [stars, setStars] = useState(0), [note, setNote] = useState(''), [count, setCount] = useState(0)
  const [saving, setSaving] = useState(false), [error, setError] = useState(false)
  const busy = useRef(false), version = useRef(0)
  const counter = useRef(createDayCount()).current
  const visible = useRef(false)
  const run = useRef(singleFlight()).current
  const refresh = async () => {
    if (busy.current) return
    const v = ++version.current
    try {
      if (!await guardPage()) return
      const [value, moods] = await Promise.all([api.score(), counter.refresh(api.moods)])
      if (v !== version.current || !moods) return
      useScore.getState().setScore(value); setCount(counter.count); setError(false)
    } catch { setError(true) }
  }
  useDidShow(() => { visible.current = true; void refresh() })
  useDidHide(() => { visible.current = false })
  useEffect(() => {
    const timer = setInterval(() => {
      if (visible.current && !counter.refreshing && counter.date !== localDate(new Date())) void refresh()
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  useShareAppMessage(() => ({ title: score?.copy.slogan ?? '该溜吗', path: '/pages/launch/index' }))
  const submit = () => run(async () => {
    if (busy.current || stars === 0) return
    const parsed = moodCreateSchema.safeParse({ stars, note })
    if (!parsed.success) return
    busy.current = true; setSaving(true); ++version.current; counter.invalidate()
    try {
      const result = await api.checkin(parsed.data)
      useScore.getState().setScore(result)
      if (counter.increment()) setCount(counter.count)
      else void counter.refresh(api.moods).then(ok => { if (ok) setCount(counter.count) }).catch(() => setError(true))
      setStars(0); setNote('')
    } catch { setError(true) }
    finally { busy.current = false; setSaving(false) }
  })
  return <View className='screen'><View className='card'><View className='title'>此刻上班心情？</View>
    <MoodStars value={stars} onChange={setStars} /><Textarea className='note' maxlength={200} value={note}
      placeholder='一句话记录（选填）' onInput={e => setNote(e.detail.value)} />
    <Button className='primary' disabled={!stars || saving} loading={saving} onClick={() => void submit()}>打卡</Button>
    <View className='muted'>今日已打卡 {count} 次</View></View>
    {score && <ScoreCard score={score} />}{error && <Button onClick={() => void refresh()}>加载失败，重试</Button>}</View>
}

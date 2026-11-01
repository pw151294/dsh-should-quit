import { useRef, useState } from 'react'
import Taro, { useLoad } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { BASELINE_OPTIONS, baselineSchema, type BaselineInput } from '@should-quit/shared'
import { api } from '../../services/api'
import { ensureLogin } from '../../services/auth'
import { useAuth } from '../../stores/auth'
import { useScore } from '../../stores/score'
import Question from '../../components/baseline-question'
import { previewBaseline } from './model'
export default function Baseline() {
  const [draft, setDraft] = useState<Partial<BaselineInput>>({}), [index, setIndex] = useState<number | null>(0)
  const [editing, setEditing] = useState(false), [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const [loadError, setLoadError] = useState(false)
  const load = async () => {
    setLoadError(false)
    try {
    await ensureLogin()
    const { baseline } = await api.baseline()
    if (baseline) { setDraft(baseline as BaselineInput); setEditing(true); setIndex(null) }
    setLoaded(true)
    } catch { setLoadError(true) }
  }
  useLoad(() => { void load() })
  const preview = previewBaseline(draft)
  const save = async () => {
    if (busy.current || !preview.complete) return
    const parsed = baselineSchema.parse(draft)
    busy.current = true; setSaving(true)
    try {
      const score = await api.saveBaseline(parsed)
      useScore.getState().setScore(score); useAuth.getState().setBaseline(true)
      if (editing) setIndex(null)
      else await Taro.switchTab({ url: '/pages/home/index' })
    } catch { }
    finally { busy.current = false; setSaving(false) }
  }
  if (!loaded) return <View>{loadError ? <Button onClick={() => void load()}>读取失败，重试</Button> : '正在读取基准…'}</View>
  const q = index === null ? undefined : BASELINE_OPTIONS[index]
  return <View className='screen'>
    {q && <><View>{index! + 1} / 8</View><Question question={q} value={draft[q.field]} onChange={level => {
      setDraft(old => ({ ...old, [q.field]: level }))
      if (!editing && index! < 7) setIndex(index! + 1)
    }} />
    {!editing && index! > 0 && <Button onClick={() => setIndex(index! - 1)}>上一项</Button>}</>}
    {index === null && BASELINE_OPTIONS.map((question, i) => <Button key={question.field} onClick={() => setIndex(i)}>
      {question.title}：{question.options.find(o => o.level === draft[question.field])?.label ?? '未填'}</Button>)}
    <View>客观分预览 {preview.score}</View>{!preview.complete && <View className='muted'>未填项暂按一般预览</View>}
    <Button className='primary' disabled={!preview.complete || saving} loading={saving} onClick={() => void save()}>保存</Button>
    {editing && index !== null && <Button onClick={() => setIndex(null)}>返回总览</Button>}
  </View>
}

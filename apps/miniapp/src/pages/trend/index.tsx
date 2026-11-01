import './index.css'
import { useEffect, useRef, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { localDate, shiftDate, TREND_RANGE_DAYS, type TrendRange, type MoodDailyItem, type MoodItem } from '@should-quit/shared'
import { latestRequest } from './generation'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
import TrendChart from '../../components/trend-chart'
import { fillTrend, type TrendRow } from '../../components/trend-chart/geometry'
import MoodCalendar from '../../components/mood-calendar'
export default function Trend() {
  const [range, setRange] = useState<TrendRange>('30d'), [rows, setRows] = useState<TrendRow[]>([])
  const [daily, setDaily] = useState<MoodDailyItem[]>([]), [today, setToday] = useState(localDate(new Date()))
  const [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState('')
  const [details, setDetails] = useState<MoodItem[]>([]), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [detailError, setDetailError] = useState(false)
  const version = useRef(latestRequest()), detailVersion = useRef(latestRequest())
  const load = async (nextRange: TrendRange) => {
    const current = version.current.begin(), date = localDate(new Date()); setRange(nextRange); setToday(date); setRows([]); setDaily([]); setFailed(false)
    const firstMonth = shiftDate(date, -89).slice(0, 7)
    setMonth(value => value < firstMonth ? firstMonth : value > date.slice(0, 7) ? date.slice(0, 7) : value)
    try {
      if (!await guardPage()) return
      const [trend, daily] = await Promise.all([api.trend(nextRange), api.daily(90)])
      if (!current()) return
      setRows(fillTrend(trend, shiftDate(date, -(TREND_RANGE_DAYS[nextRange] - 1)), date)); setDaily(daily); setFailed(false)
    } catch { if (current()) setFailed(true) }
  }
  const show = async (date: string) => {
    const current = detailVersion.current.begin(); setSelected(date); setLoading(true); setDetails([]); setDetailError(false)
    try { const items = await api.moods(date); if (current()) setDetails(items) }
    catch { if (current()) setDetailError(true) }
    finally { if (current()) setLoading(false) }
  }
  useDidShow(() => { void load(range) })
  useEffect(() => {
    const timer = setInterval(() => {
      const date = localDate(new Date())
      if (date !== today) void load(range)
    }, 30000)
    return () => clearInterval(timer)
  }, [today, range])
  return <View className='screen'><View className='row'>{(['7d', '30d', '90d'] as const).map(r =>
    <Button key={r} className={range === r ? 'selected' : ''} onClick={() => void load(r)}>{r.slice(0, -1)}天</Button>)}</View>
    <View className='card'><TrendChart rows={rows} /></View>
    {failed && <Button onClick={() => void load(range)}>加载失败，重试</Button>}
    <MoodCalendar month={month} today={today} daily={daily} onMonth={setMonth} onDate={date => void show(date).catch(() => {})} />
    {selected && <View className='sheet'><View className='title'>{selected} 打卡明细</View>
      {loading ? '正在读取…' : detailError ? <Button onClick={() => void show(selected)}>读取失败，重试</Button> : details.length ? details.map(item => <View className='card' key={item.id}>
        <View>{localTime(item.createdAt)} {'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}</View><View>{item.note ?? '无备注'}</View>
      </View>) : '当天没有打卡'}
      <Button onClick={() => { detailVersion.current.cancel(); setSelected('') }}>关闭</Button></View>}</View>
}
function localTime(iso: string) { return new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(11, 16) }

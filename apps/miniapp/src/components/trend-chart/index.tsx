import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Canvas, View } from '@tarojs/components'
import { chartPoints, nearestPoint, trendSummary, type ChartPoint, type TrendRow } from './geometry'
interface CanvasNode { width: number; height: number; getContext(type: '2d'): CanvasRenderingContext2D }
export default function TrendChart({ rows }: { rows: TrendRow[] }) {
  const [selected, setSelected] = useState<ChartPoint | null>(null)
  const points = useRef<ChartPoint[]>([]), left = useRef(0)
  useEffect(() => {
    let cancelled = false
    Taro.nextTick(() => {
      Taro.createSelectorQuery().select('#trend-canvas').fields({ node: true, size: true, rect: true }).exec(result => {
        if (cancelled) return
        const rect = result[0] as { node: CanvasNode; width: number; height: number; left: number } | undefined
        if (!rect?.node) return
        left.current = rect.left
        const { node, width, height } = rect
        const ratio = Taro.getSystemInfoSync().pixelRatio
        node.width = width * ratio; node.height = height * ratio
        const ctx = node.getContext('2d'); ctx.scale(ratio, ratio)
        ctx.clearRect(0, 0, width, height)
        const y = (score: number) => 12 + (100 - score) / 100 * (height - 36)
        const bands = [[0, 20, '#fce6e6'], [20, 60, '#fff0dc'], [60, 80, '#fffadd'], [80, 100, '#e6f3e2']] as const
        for (const [min, max, color] of bands) { ctx.fillStyle = color; ctx.fillRect(32, y(max), width - 44, y(min) - y(max)) }
        ctx.font = '11px sans-serif'; ctx.fillStyle = '#333'
        for (const score of [0, 20, 60, 80, 100]) ctx.fillText(String(score), 2, y(score) + 4)
        const ps = chartPoints(rows, width, height); points.current = ps
        ctx.strokeStyle = '#8a4b00'; ctx.fillStyle = '#8a4b00'; ctx.lineWidth = 2
        let started = false
        ctx.beginPath()
        for (const p of ps) {
          if (p.y === null) { started = false; continue }
          if (!started) { ctx.moveTo(p.x, p.y); started = true } else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
        for (const p of ps) if (p.y !== null) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill() }
        setSelected(null)
      })
    })
    return () => { cancelled = true }
  }, [rows])
  return <View><Canvas id='trend-canvas' type='2d' style={{ width: '100%', height: '220px' }}
    onTouchEnd={e => {
      const touch = e.changedTouches[0]
      if (touch) setSelected(nearestPoint(points.current, ('clientX' in touch ? Number(touch.clientX) - left.current : touch.x)))
    }} />
    {selected && <View>{selected.date}：{selected.score}分</View>}
    <View className='muted'>{trendSummary(rows)}</View></View>
}

import { daysBetween, shiftDate, type TrendResponse } from '@should-quit/shared'
export interface TrendRow { date: string; score: number | null }
export interface ChartPoint extends TrendRow { x: number; y: number | null }
export function fillTrend(data: TrendResponse, start: string, end: string): TrendRow[] {
  const count = daysBetween(start, end) + 1
  if (count < 1 || count > 90) throw new Error('invalid range')
  const byDate = new Map(data.items.map(item => [item.date, item.totalScore]))
  let score = data.before?.totalScore ?? null
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDate(start, i)
    if (byDate.has(date)) score = byDate.get(date)!
    return { date, score }
  })
}
export function chartPoints(rows: TrendRow[], width: number, height: number): ChartPoint[] {
  const w = Math.max(0, width - 44), h = Math.max(0, height - 36)
  return rows.map((row, i) => ({ ...row, x: 32 + (rows.length === 1 ? w / 2 : i / (rows.length - 1) * w),
    y: row.score === null ? null : 12 + (100 - row.score) / 100 * h }))
}
export function nearestPoint(points: ChartPoint[], x: number): ChartPoint | null {
  return points.reduce<ChartPoint | null>((best, point) => point.score === null ? best
    : !best || Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, null)
}
export function trendSummary(rows: TrendRow[]): string {
  const values = rows.filter(row => row.score !== null)
  if (!values.length) return '这段时间暂无评分记录'
  if (values.length === 1) return `${values[0]!.date}：${values[0]!.score}分`
  return `${values[0]!.date}至${values.at(-1)!.date}，从${values[0]!.score}分到${values.at(-1)!.score}分`
}

import { shiftDate, type MoodDailyItem } from '@should-quit/shared'
export function moodColor(avg: number | null): string {
  if (avg === null) return 'gray'
  return avg <= 25 ? 'red' : avg <= 50 ? 'orange' : avg <= 75 ? 'yellow' : 'green'
}
export interface MonthCell { date: string; avg: number | null; count: number }
export function monthCells(month: string, daily: MoodDailyItem[]): Array<MonthCell | null> {
  const first = month + '-01', byDate = new Map(daily.map(d => [d.date, d]))
  const weekday = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7
  const cells: Array<MonthCell | null> = Array.from({ length: weekday }, () => null)
  for (let date = first; date.startsWith(month + '-'); date = shiftDate(date, 1)) {
    const item = byDate.get(date)
    cells.push({ date, avg: item?.avg ?? null, count: item?.count ?? 0 })
  }
  while (cells.length % 7) cells.push(null)
  return cells
}
export function shiftMonth(month: string, by: number): string {
  const date = new Date(month + '-01T00:00:00Z')
  date.setUTCMonth(date.getUTCMonth() + by)
  return date.toISOString().slice(0, 7)
}

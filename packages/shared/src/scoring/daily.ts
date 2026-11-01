// packages/shared/src/scoring/daily.ts
import { daysBetween } from '../time.js'
import { MOOD_WINDOW_DAYS, starsToScore } from './mood.js'
import { round2 } from './objective.js'

export interface DailyMoodRow {
  date: string
  /** 距 today 的天数，today 为 0 */
  age: number
  /** 当日均分 0–100，保留两位小数 */
  avg: number
  count: number
}

/** 把打卡记录按本地日期聚合；只保留 age ∈ [0, windowDays − 1]，按 date 升序 */
export function aggregateDaily(
  checkins: ReadonlyArray<{ checkinDate: string; stars: number }>,
  today: string,
  windowDays: number = MOOD_WINDOW_DAYS,
): DailyMoodRow[] {
  if (!Number.isInteger(windowDays) || windowDays < 1) throw new Error(`invalid windowDays: ${windowDays}`)
  // 先校验 today 格式
  daysBetween(today, today)
  const groups = new Map<string, { sum: number; count: number; age: number }>()
  for (const c of checkins) {
    const age = daysBetween(c.checkinDate, today)
    if (age < 0) throw new Error(`checkin in the future: ${c.checkinDate} > ${today}`)
    if (age >= windowDays) continue
    const g = groups.get(c.checkinDate) ?? { sum: 0, count: 0, age }
    g.sum += starsToScore(c.stars)
    g.count += 1
    groups.set(c.checkinDate, g)
  }
  return [...groups.entries()]
    .map(([date, g]) => ({ date, age: g.age, avg: round2(g.sum / g.count), count: g.count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

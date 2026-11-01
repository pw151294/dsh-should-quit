// packages/shared/src/scoring/mood.ts
import { round2 } from './objective.js'

export const MOOD_WINDOW_DAYS = 30
export const MOOD_HALF_LIFE_DAYS = 7

export interface DailyMood {
  /** 距今天数，今天为 0 */
  age: number
  /** 当日均分 0–100 */
  avg: number
}

export function starsToScore(stars: number): number {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error(`invalid stars: ${stars}`)
  return ((stars - 1) / 4) * 100
}

/** 当天所有打卡星级 → 日均分 */
export function dailyAverage(stars: number[]): number {
  if (stars.length === 0) throw new Error('dailyAverage: empty')
  const sum = stars.reduce((acc, s) => acc + starsToScore(s), 0)
  return round2(sum / stars.length)
}

/** 近 30 天指数衰减加权平均；窗口内无数据返回 null */
export function moodScore(daily: DailyMood[]): number | null {
  let wSum = 0
  let sum = 0
  for (const { age, avg } of daily) {
    if (!Number.isInteger(age) || age < 0) throw new Error(`invalid age: ${age}`)
    if (!Number.isFinite(avg) || avg < 0 || avg > 100) throw new Error(`invalid avg: ${avg}`)
    if (age >= MOOD_WINDOW_DAYS) continue
    const w = Math.pow(0.5, age / MOOD_HALF_LIFE_DAYS)
    wSum += w
    sum += w * avg
  }
  return wSum === 0 ? null : round2(sum / wSum)
}

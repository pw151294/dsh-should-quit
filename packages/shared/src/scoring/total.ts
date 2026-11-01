// packages/shared/src/scoring/total.ts
import { objectiveScore, type BaselineField, type BaselineInput } from './objective.js'
import { moodScore, type DailyMood } from './mood.js'

export const ALGO_VERSION = 1
export const OBJECTIVE_WEIGHT = 0.6
export const MOOD_WEIGHT = 0.4

export type Tier = 'RUN' | 'SEEK' | 'WATCH' | 'STAY'

/** 闭区间，按分数升序 */
export const TIERS: ReadonlyArray<{ tier: Tier; min: number; max: number }> = [
  { tier: 'RUN', min: 0, max: 20 },
  { tier: 'SEEK', min: 21, max: 60 },
  { tier: 'WATCH', min: 61, max: 80 },
  { tier: 'STAY', min: 81, max: 100 },
]

export interface ScoreResult {
  objectiveScore: number
  moodScore: number | null
  totalScore: number
  tier: Tier
  breakdown: Record<BaselineField, number>
  algoVersion: number
}

/** 返回四舍五入后的整数 */
export function totalScore(objective: number, mood: number | null): number {
  const raw = mood === null ? objective : objective * OBJECTIVE_WEIGHT + mood * MOOD_WEIGHT
  // 先修正浮点误差（如 objective=9,mood=0.25 时 5.5 存成 5.4999…），再取整
  return Math.round(Math.round(raw * 1e6) / 1e6)
}

export function tierOf(total: number): Tier {
  if (!Number.isInteger(total) || total < 0 || total > 100) throw new Error(`invalid total: ${total}`)
  const hit = TIERS.find((t) => total >= t.min && total <= t.max)
  if (!hit) throw new Error(`no tier for ${total}`)
  return hit.tier
}

export function computeScore(b: BaselineInput, daily: DailyMood[]): ScoreResult {
  const obj = objectiveScore(b)
  const mood = moodScore(daily)
  const total = totalScore(obj.score, mood)
  return {
    objectiveScore: obj.score,
    moodScore: mood,
    totalScore: total,
    tier: tierOf(total),
    breakdown: obj.breakdown,
    algoVersion: ALGO_VERSION,
  }
}

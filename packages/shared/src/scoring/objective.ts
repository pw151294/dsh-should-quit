// packages/shared/src/scoring/objective.ts
export const BASELINE_FIELDS = [
  'salary', 'overtime', 'growth', 'workload', 'contentFit', 'commute', 'restTime', 'stabilityBenefits',
] as const
export type BaselineField = typeof BASELINE_FIELDS[number]
export type Level = 1 | 2 | 3 | 4 | 5
export type BaselineInput = Record<BaselineField, Level>

/** 项权重，合计 100。改动时同步提升 ALGO_VERSION */
export const BASELINE_WEIGHTS: Record<BaselineField, number> = {
  salary: 20,
  overtime: 15,
  growth: 15,
  workload: 12,
  contentFit: 12,
  commute: 10,
  restTime: 8,
  stabilityBenefits: 8,
}

function assertLevel(field: string, v: unknown): asserts v is Level {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
    throw new Error(`invalid level for ${field}: ${String(v)}`)
  }
}

export function levelToScore(level: number): number {
  assertLevel('level', level)
  return (level - 1) * 25
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function objectiveScore(b: BaselineInput): { score: number; breakdown: Record<BaselineField, number> } {
  const breakdown = {} as Record<BaselineField, number>
  let sum = 0
  for (const f of BASELINE_FIELDS) {
    const level = (b as Record<string, unknown>)[f]
    assertLevel(f, level)
    const s = levelToScore(level)
    breakdown[f] = s
    sum += s * BASELINE_WEIGHTS[f]
  }
  return { score: round2(sum / 100), breakdown }
}

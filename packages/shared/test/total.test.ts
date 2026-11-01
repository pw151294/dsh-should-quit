import { describe, expect, it } from 'vitest'
import { ALGO_VERSION, OBJECTIVE_WEIGHT, MOOD_WEIGHT, TIERS, computeScore, tierOf, totalScore } from '../src/scoring/total.js'
import type { BaselineInput } from '../src/scoring/objective.js'

const all = (l: 1 | 2 | 3 | 4 | 5): BaselineInput => ({
  salary: l, overtime: l, growth: l, workload: l, contentFit: l, commute: l, restTime: l, stabilityBenefits: l,
})

describe('totalScore', () => {
  it('权重 0.6 / 0.4，算法版本为 1', () => {
    expect(OBJECTIVE_WEIGHT).toBe(0.6)
    expect(MOOD_WEIGHT).toBe(0.4)
    expect(ALGO_VERSION).toBe(1)
  })
  it('有心情分时加权并四舍五入', () => {
    expect(totalScore(52, 39)).toBe(47) // 31.2 + 15.6 = 46.8
  })
  it('心情分为 null 时等于客观分取整', () => {
    expect(totalScore(52.5, null)).toBe(53)
  })
  it('0.6×9 + 0.4×0.25 = 5.5，浮点修正后四舍五入为 6', () => {
    expect(totalScore(9, 0.25)).toBe(6)
  })
})

describe('tierOf', () => {
  it.each([
    [0, 'RUN'], [20, 'RUN'], [21, 'SEEK'], [60, 'SEEK'],
    [61, 'WATCH'], [80, 'WATCH'], [81, 'STAY'], [100, 'STAY'],
  ] as const)('%i → %s', (score, tier) => {
    expect(tierOf(score)).toBe(tier)
  })
  it('非整数或越界抛错', () => {
    expect(() => tierOf(20.5)).toThrow()
    expect(() => tierOf(-1)).toThrow()
    expect(() => tierOf(101)).toThrow()
  })
  it('四档按顺序覆盖 0–100 无空隙', () => {
    expect(TIERS.map((t) => [t.min, t.max])).toEqual([[0, 20], [21, 60], [61, 80], [81, 100]])
  })
})

describe('四舍五入后再判档', () => {
  it('20.4 → RUN，20.5 → SEEK', () => {
    expect(tierOf(totalScore(20.4, null))).toBe('RUN')
    expect(tierOf(totalScore(20.5, null))).toBe('SEEK')
  })
})

describe('computeScore', () => {
  it('无打卡：mood 为 null，total 等于客观分', () => {
    const r = computeScore(all(3), [])
    expect(r).toMatchObject({ objectiveScore: 50, moodScore: null, totalScore: 50, tier: 'SEEK', algoVersion: 1 })
    expect(r.breakdown.salary).toBe(50)
  })
  it('全满分 + 心情满分 → 100 / STAY', () => {
    expect(computeScore(all(5), [{ age: 0, avg: 100 }])).toMatchObject({ totalScore: 100, tier: 'STAY' })
  })
  it('全最差 + 心情最差 → 0 / RUN', () => {
    expect(computeScore(all(1), [{ age: 0, avg: 0 }])).toMatchObject({ totalScore: 0, tier: 'RUN' })
  })
})

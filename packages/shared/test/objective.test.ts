import { describe, expect, it } from 'vitest'
import {
  BASELINE_FIELDS, BASELINE_WEIGHTS, levelToScore, objectiveScore, type BaselineInput,
} from '../src/scoring/objective.js'

const all = (level: 1 | 2 | 3 | 4 | 5): BaselineInput =>
  Object.fromEntries(BASELINE_FIELDS.map((f) => [f, level])) as BaselineInput

describe('objectiveScore', () => {
  it('8 个字段，权重合计 100', () => {
    expect(BASELINE_FIELDS).toHaveLength(8)
    expect(BASELINE_FIELDS.reduce((s, f) => s + BASELINE_WEIGHTS[f], 0)).toBe(100)
  })
  it('等级映射 0/25/50/75/100', () => {
    expect([1, 2, 3, 4, 5].map(levelToScore)).toEqual([0, 25, 50, 75, 100])
  })
  it('全 1 → 0，全 5 → 100，全 3 → 50', () => {
    expect(objectiveScore(all(1)).score).toBe(0)
    expect(objectiveScore(all(5)).score).toBe(100)
    expect(objectiveScore(all(3)).score).toBe(50)
  })
  it('只有薪资为 5、其余为 1 → 20（薪资权重 20）', () => {
    const r = objectiveScore({ ...all(1), salary: 5 })
    expect(r.score).toBe(20)
    expect(r.breakdown.salary).toBe(100)
    expect(r.breakdown.commute).toBe(0)
  })
  it('通勤为 2、其余为 1 → 2.5（保留小数）', () => {
    expect(objectiveScore({ ...all(1), commute: 2 }).score).toBe(2.5)
  })
  it('等级越界或缺项时抛错', () => {
    expect(() => objectiveScore({ ...all(3), salary: 6 } as unknown as BaselineInput)).toThrow()
    const { growth: _g, ...missing } = all(3)
    expect(() => objectiveScore(missing as unknown as BaselineInput)).toThrow()
  })
})

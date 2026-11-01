import { describe, expect, it } from 'vitest'
import { BASELINE_OPTIONS, optionLabel } from '../src/baseline-options.js'
import { BASELINE_FIELDS } from '../src/scoring/objective.js'

describe('BASELINE_OPTIONS', () => {
  it('覆盖全部 8 个字段，顺序与 BASELINE_FIELDS 一致', () => {
    expect(BASELINE_OPTIONS.map((q) => q.field)).toEqual([...BASELINE_FIELDS])
  })
  it('每题 5 个选项，level 恰好是 1–5 各一个', () => {
    for (const q of BASELINE_OPTIONS) {
      expect(q.options).toHaveLength(5)
      expect([...q.options.map((o) => o.level)].sort()).toEqual([1, 2, 3, 4, 5])
    }
  })
  it('题目与选项文案非空', () => {
    for (const q of BASELINE_OPTIONS) {
      expect(q.title.length).toBeGreaterThan(0)
      for (const o of q.options) expect(o.label.length).toBeGreaterThan(0)
    }
  })
  it('通勤：<30 分钟为 5，>120 分钟为 1', () => {
    expect(optionLabel('commute', 5)).toBe('30 分钟以内')
    expect(optionLabel('commute', 1)).toBe('2 小时以上')
  })
  it('加班：从不为 5，天天为 1', () => {
    expect(optionLabel('overtime', 5)).toBe('从不加班')
    expect(optionLabel('overtime', 1)).toBe('天天加班')
  })
  it('非法 level 抛错', () => {
    expect(() => optionLabel('salary', 6)).toThrow()
  })
})

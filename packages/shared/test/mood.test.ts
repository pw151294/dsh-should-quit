import { describe, expect, it } from 'vitest'
import { MOOD_HALF_LIFE_DAYS, MOOD_WINDOW_DAYS, dailyAverage, moodScore, starsToScore } from '../src/scoring/mood.js'

describe('starsToScore', () => {
  it('1–5 星映射 0/25/50/75/100', () => {
    expect([1, 2, 3, 4, 5].map(starsToScore)).toEqual([0, 25, 50, 75, 100])
  })
  it('越界抛错', () => {
    expect(() => starsToScore(0)).toThrow()
    expect(() => starsToScore(3.5)).toThrow()
  })
})

describe('dailyAverage', () => {
  it('当天多次打卡取均值，保留两位小数', () => {
    expect(dailyAverage([1, 2, 2])).toBe(16.67) // (0+25+25)/3
  })
  it('空数组抛错', () => {
    expect(() => dailyAverage([])).toThrow()
  })
})

describe('moodScore', () => {
  it('常量：窗口 30 天、半衰期 7 天', () => {
    expect(MOOD_WINDOW_DAYS).toBe(30)
    expect(MOOD_HALF_LIFE_DAYS).toBe(7)
  })
  it('无数据为 null', () => {
    expect(moodScore([])).toBeNull()
  })
  it('只有一天时等于该日均分', () => {
    expect(moodScore([{ age: 3, avg: 40 }])).toBe(40)
  })
  it('距今 29 天计入，30 天不计入', () => {
    expect(moodScore([{ age: 29, avg: 80 }])).toBe(80)
    expect(moodScore([{ age: 30, avg: 80 }])).toBeNull()
    expect(moodScore([{ age: 0, avg: 0 }, { age: 30, avg: 100 }])).toBe(0)
  })
  it('衰减权重：今天 100、7 天前 0 → 权重 1:0.5 → 66.67', () => {
    expect(moodScore([{ age: 0, avg: 100 }, { age: 7, avg: 0 }])).toBe(66.67)
  })
  it('一个月前低落、最近一周好转时，分数明显高于简单平均', () => {
    const daily = [
      ...[20, 21, 22, 23, 24, 25, 26].map((age) => ({ age, avg: 0 })),
      ...[0, 1, 2, 3, 4, 5, 6].map((age) => ({ age, avg: 100 })),
    ]
    const s = moodScore(daily)!
    expect(s).toBeGreaterThan(80) // 简单平均为 50
  })
  it('负数 age（未来日期）抛错', () => {
    expect(() => moodScore([{ age: -1, avg: 50 }])).toThrow()
  })
  it('avg 为 NaN 抛错', () => {
    expect(() => moodScore([{ age: 0, avg: NaN }])).toThrow()
  })
  it('avg 超出 [0,100] 上界抛错', () => {
    expect(() => moodScore([{ age: 0, avg: 150 }])).toThrow()
  })
  it('avg 低于 [0,100] 下界抛错', () => {
    expect(() => moodScore([{ age: 0, avg: -1 }])).toThrow()
  })
})

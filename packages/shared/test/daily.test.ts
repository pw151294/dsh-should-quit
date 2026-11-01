import { describe, expect, it } from 'vitest'
import { aggregateDaily } from '../src/scoring/daily.js'
import { moodScore } from '../src/scoring/mood.js'

const TODAY = '2026-10-31'

describe('aggregateDaily', () => {
  it('同一天多次打卡合并：avg 为 0–100 均值，count 为次数', () => {
    const r = aggregateDaily([
      { checkinDate: TODAY, stars: 1 },
      { checkinDate: TODAY, stars: 2 },
      { checkinDate: TODAY, stars: 2 },
    ], TODAY)
    expect(r).toEqual([{ date: TODAY, age: 0, avg: 16.67, count: 3 }])
  })
  it('按日期升序输出，age 为距 today 的天数', () => {
    const r = aggregateDaily([
      { checkinDate: '2026-10-31', stars: 5 },
      { checkinDate: '2026-10-29', stars: 3 },
    ], TODAY)
    expect(r.map((d) => [d.date, d.age])).toEqual([['2026-10-29', 2], ['2026-10-31', 0]])
  })
  it('默认窗口 30 天：距今 29 天保留，30 天丢弃', () => {
    const r = aggregateDaily([
      { checkinDate: '2026-10-02', stars: 3 }, // age 29
      { checkinDate: '2026-10-01', stars: 3 }, // age 30
    ], TODAY)
    expect(r.map((d) => d.age)).toEqual([29])
  })
  it('windowDays 可调，用于 days=7 / 90 的查询', () => {
    const rows = [{ checkinDate: '2026-10-24', stars: 3 }, { checkinDate: '2026-10-25', stars: 3 }]
    expect(aggregateDaily(rows, TODAY, 7).map((d) => d.age)).toEqual([6])
  })
  it('未来日期抛错（说明服务端日期计算有误）', () => {
    expect(() => aggregateDaily([{ checkinDate: '2026-11-01', stars: 3 }], TODAY)).toThrow()
  })
  it('空输入返回空数组，moodScore 对它返回 null', () => {
    expect(aggregateDaily([], TODAY)).toEqual([])
    expect(moodScore(aggregateDaily([], TODAY))).toBeNull()
  })
  it('windowDays 非正整数时抛错', () => {
    expect(() => aggregateDaily([], TODAY, 0)).toThrow()
  })
  it('today 格式非法时抛错', () => {
    expect(() => aggregateDaily([], '2026/10/31')).toThrow()
  })
})

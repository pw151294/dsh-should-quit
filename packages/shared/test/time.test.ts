import { describe, expect, it } from 'vitest'
import { APP_TZ, daysBetween, localDate, shiftDate } from '../src/time.js'

describe('localDate', () => {
  it('APP_TZ 固定为 Asia/Shanghai', () => {
    expect(APP_TZ).toBe('Asia/Shanghai')
  })
  it('北京时间 23:59 与次日 00:01 归入不同的两天', () => {
    // 2026-10-31 23:59 北京时间 = 2026-10-31T15:59Z
    expect(localDate(new Date('2026-10-31T15:59:00Z'))).toBe('2026-10-31')
    // 2026-11-01 00:01 北京时间 = 2026-10-31T16:01Z
    expect(localDate(new Date('2026-10-31T16:01:00Z'))).toBe('2026-11-01')
  })
  it('跨年', () => {
    expect(localDate(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
  })
})

describe('daysBetween', () => {
  it('同一天为 0，次日为 1', () => {
    expect(daysBetween('2026-10-31', '2026-10-31')).toBe(0)
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
  })
  it('跨月、跨闰年 2 月', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })
  it('from 晚于 to 时为负数', () => {
    expect(daysBetween('2026-11-01', '2026-10-31')).toBe(-1)
  })
  it('非法格式抛错', () => {
    expect(() => daysBetween('2026/10/31', '2026-10-31')).toThrow()
  })
})

describe('shiftDate', () => {
  it('向前 29 天', () => {
    expect(shiftDate('2026-10-31', -29)).toBe('2026-10-02')
  })
  it('跨月向后', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01')
  })
  it('days 为 NaN 抛错', () => {
    expect(() => shiftDate('2026-10-31', NaN)).toThrow()
  })
  it('days 为小数抛错', () => {
    expect(() => shiftDate('2026-10-31', 0.5)).toThrow()
  })
})

describe('localDate 错误处理', () => {
  it('非法 Date 抛错', () => {
    expect(() => localDate(new Date('x'))).toThrow()
  })
})

describe('daysBetween 日期进位拦截', () => {
  it('2026-02-30 抛错', () => {
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow()
  })
})

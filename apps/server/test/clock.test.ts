import { describe, expect, it } from 'vitest'
import { FixedClock, SystemClock } from '../src/clock.js'
import { fromDbDate, toDbDate } from '../src/db-date.js'

describe('Clock', () => {
  it('FixedClock 的 today 按北京时间计算', () => {
    expect(new FixedClock(new Date('2026-10-31T15:59:00Z')).today()).toBe('2026-10-31')
    expect(new FixedClock(new Date('2026-10-31T16:01:00Z')).today()).toBe('2026-11-01')
  })
  it('FixedClock 可推进时间', () => {
    const c = new FixedClock(new Date('2026-10-31T00:00:00Z'))
    c.advanceDays(2)
    expect(c.today()).toBe('2026-11-02')
  })
  it('FixedClock 复制传入的 Date，外部修改不影响 now()', () => {
    const d = new Date('2026-10-31T00:00:00Z')
    const c = new FixedClock(d)
    d.setUTCFullYear(2000)
    expect(c.now().toISOString()).toBe('2026-10-31T00:00:00.000Z')
    const d2 = new Date('2026-11-05T00:00:00Z')
    c.set(d2)
    d2.setUTCFullYear(2000)
    expect(c.now().toISOString()).toBe('2026-11-05T00:00:00.000Z')
  })
  it('SystemClock 返回当前时间', () => {
    const before = Date.now()
    expect(new SystemClock().now().getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe('db-date', () => {
  it("'YYYY-MM-DD' 与 @db.Date 的 UTC 零点互转", () => {
    const d = toDbDate('2026-10-31')
    expect(d.toISOString()).toBe('2026-10-31T00:00:00.000Z')
    expect(fromDbDate(d)).toBe('2026-10-31')
  })
  it('非法日期抛错', () => {
    expect(() => toDbDate('2026-02-30')).toThrow()
  })
})

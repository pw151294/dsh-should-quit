import { describe, expect, it } from 'vitest'
import {
  askSchema, baselineSchema, dailyQuerySchema, loginSchema, moodCreateSchema, moodDateQuerySchema, trendQuerySchema,
} from '../src/dto.js'

const fullBaseline = {
  salary: 3, overtime: 3, growth: 3, workload: 3, contentFit: 3, commute: 3, restTime: 3, stabilityBenefits: 3,
}

describe('baselineSchema', () => {
  it('8 项 1–5 整数通过', () => {
    expect(baselineSchema.parse(fullBaseline)).toEqual(fullBaseline)
  })
  it('缺项、越界、小数、多余字段都拒绝', () => {
    const { salary: _s, ...missing } = fullBaseline
    expect(baselineSchema.safeParse(missing).success).toBe(false)
    expect(baselineSchema.safeParse({ ...fullBaseline, salary: 6 }).success).toBe(false)
    expect(baselineSchema.safeParse({ ...fullBaseline, salary: 2.5 }).success).toBe(false)
    expect(baselineSchema.safeParse({ ...fullBaseline, extra: 1 }).success).toBe(false)
  })
})

describe('moodCreateSchema', () => {
  it('星级 1–5；备注可选，去首尾空白，空串视为未填', () => {
    expect(moodCreateSchema.parse({ stars: 4 })).toEqual({ stars: 4 })
    expect(moodCreateSchema.parse({ stars: 4, note: '  累  ' })).toEqual({ stars: 4, note: '累' })
    expect(moodCreateSchema.parse({ stars: 4, note: '   ' })).toEqual({ stars: 4 })
  })
  it('备注超过 200 字拒绝，星级越界拒绝', () => {
    expect(moodCreateSchema.safeParse({ stars: 4, note: '字'.repeat(201) }).success).toBe(false)
    expect(moodCreateSchema.safeParse({ stars: 0 }).success).toBe(false)
  })
})

describe('查询参数', () => {
  it('days 从字符串转数字，默认 30，范围 1–90', () => {
    expect(dailyQuerySchema.parse({})).toEqual({ days: 30 })
    expect(dailyQuerySchema.parse({ days: '7' })).toEqual({ days: 7 })
    expect(dailyQuerySchema.safeParse({ days: '91' }).success).toBe(false)
  })
  it('range 只接受 7d/30d/90d，默认 30d', () => {
    expect(trendQuerySchema.parse({})).toEqual({ range: '30d' })
    expect(trendQuerySchema.safeParse({ range: '1y' }).success).toBe(false)
  })
  it('date 必须是合法的 YYYY-MM-DD', () => {
    expect(moodDateQuerySchema.parse({ date: '2026-10-31' })).toEqual({ date: '2026-10-31' })
    expect(moodDateQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false)
  })
})

describe('askSchema / loginSchema', () => {
  it('提问 1–500 字，去首尾空白后不能为空', () => {
    expect(askSchema.parse({ text: ' 我该溜吗 ' })).toEqual({ text: '我该溜吗' })
    expect(askSchema.safeParse({ text: '   ' }).success).toBe(false)
    expect(askSchema.safeParse({ text: '字'.repeat(501) }).success).toBe(false)
  })
  it('登录 code 非空且不超过 128 字符', () => {
    expect(loginSchema.safeParse({ code: '' }).success).toBe(false)
    expect(loginSchema.parse({ code: 'abc' })).toEqual({ code: 'abc' })
  })
})

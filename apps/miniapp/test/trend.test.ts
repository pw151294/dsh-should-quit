import { expect, it } from 'vitest'
import { fillTrend, chartPoints, nearestPoint } from '../src/components/trend-chart/geometry'
import { monthCells, moodColor, shiftMonth } from '../src/components/mood-calendar/calendar'
import type { TrendPoint } from '@should-quit/shared'
const p = (date: string, totalScore: number): TrendPoint => ({ date, totalScore, tier: 'SEEK', objectiveScore: totalScore, moodScore: null })
it('only fills forward from known data', () => {
  expect(fillTrend({ before: p('2026-10-30', 47), items: [p('2026-11-02', 50)] }, '2026-11-01', '2026-11-03').map(x => x.score)).toEqual([47, 50, 50])
  expect(fillTrend({ before: null, items: [p('2026-11-02', 50)] }, '2026-11-01', '2026-11-03').map(x => x.score)).toEqual([null, 50, 50])
})
it('single point and null nearest', () => {
  const ps = chartPoints([{ date: '2026-11-01', score: 100 }], 244, 136)
  expect(ps[0]).toMatchObject({ x: 132, y: 12 })
  expect(nearestPoint(ps, -100)?.score).toBe(100)
  expect(nearestPoint(chartPoints([{ date: '2026-11-01', score: null }], 244, 136), 0)).toBeNull()
})
it('leap month and continuous decimal thresholds', () => {
  expect(monthCells('2028-02', []).filter(Boolean)).toHaveLength(29)
  expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  expect([25, 25.01, 50, 50.01, 75, 75.01].map(moodColor)).toEqual(['red', 'orange', 'orange', 'yellow', 'yellow', 'green'])
})
it('covers range sizes, bounds and empty data', () => {
  for (const n of [7,30,90]) {
    const end = new Date(Date.UTC(2026, 0, n)).toISOString().slice(0,10)
    expect(fillTrend({before:null,items:[]}, '2026-01-01', end)).toHaveLength(n)
  }
  const ps = chartPoints([{date:'a',score:0},{date:'b',score:null},{date:'c',score:100}],244,136)
  expect(ps.map(p=>p.y)).toEqual([112,null,12])
  expect(nearestPoint(ps,-999)?.date).toBe('a')
  expect(nearestPoint(ps,999)?.date).toBe('c')
  expect(monthCells('2027-01',[]).filter(Boolean)).toHaveLength(31)
  expect(shiftMonth('2027-01',-1)).toBe('2026-12')
})
import { latestRequest } from '../src/pages/trend/generation'
it('late range and date responses cannot overwrite the latest selection', async () => {
  for (const selection of ['range','date']) {
    const generation = latestRequest()
    let resolve!: (s: string) => void
    let displayed = selection
    const current = generation.begin()
    const old = new Promise<string>(r => { resolve = r }).then(value => { if(current()) displayed=value })
    const newest = generation.begin()
    if(newest()) displayed='new'
    resolve('old'); await old
    expect(displayed).toBe('new')
  }
})

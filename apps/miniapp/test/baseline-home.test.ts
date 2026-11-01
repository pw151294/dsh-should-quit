import { expect, it } from 'vitest'
import { BASELINE_FIELDS, BASELINE_OPTIONS, type BaselineInput } from '@should-quit/shared'
import { previewBaseline } from '../src/pages/baseline/model'
it('explicit eight answers required, preview is deterministic', () => {
  expect(previewBaseline({})).toEqual({ score: 50, complete: false })
  const all = (n: 1 | 5) => Object.fromEntries(BASELINE_FIELDS.map(f => [f, n])) as BaselineInput
  expect(previewBaseline(all(1))).toEqual({ score: 0, complete: true })
  expect(previewBaseline(all(5))).toEqual({ score: 100, complete: true })
  expect(BASELINE_OPTIONS.find(q => q.field === 'overtime')!.options[0]!.level).toBe(5)
})

import { createDayCount, singleFlight } from '../src/pages/home/model'
import { objectiveScore } from '@should-quit/shared'
it('complete mixed answers match shared scoring and invalid answers cannot save', () => {
 const draft = Object.fromEntries(BASELINE_FIELDS.map((f, i) => [f, i % 5 + 1])) as BaselineInput
 expect(previewBaseline(draft)).toEqual({ score: objectiveScore(draft).score, complete: true })
 expect(previewBaseline({ ...draft, salary: undefined }).complete).toBe(false)
})
it('serializes submissions and releases the lock after failure', async () => {
 const run = singleFlight()
 let calls = 0, reject!: (e: Error) => void
 const action = () => { calls++; return new Promise<void>((_, r) => { reject = r }) }
 const first = run(action)
 await run(action)
 expect(calls).toBe(1)
 reject(new Error('offline'))
 await expect(first).rejects.toThrow('offline')
 await run(async () => { calls++ })
 expect(calls).toBe(2)
})
it('restores counts and rejects stale reads after a successful post and Beijing midnight', async () => {
 let now = new Date('2026-10-31T15:59:59Z')
 const model = createDayCount(() => now)
 await model.refresh(async date => { expect(date).toBe('2026-10-31'); return [1, 2] })
 let resolve!: (rows: unknown[]) => void
 const pending = model.refresh(() => new Promise(r => { resolve = r }))
 expect(model.increment()).toBe(true)
 resolve([])
 expect(await pending).toBe(false)
 expect(model.count).toBe(3)
 now = new Date('2026-10-31T16:00:00Z')
 expect(model.increment()).toBe(false)
 await model.refresh(async date => { expect(date).toBe('2026-11-01'); return [1] })
 expect(model.count).toBe(1)
})

it.each([false, true])('only increments restored current counts: midnight=%s', async midnight => {
 let now = new Date('2026-10-31T15:59:59Z')
 const model = createDayCount(() => now)
 if (midnight) {
  await model.refresh(async () => Array(9))
  now = new Date('2026-10-31T16:00:00Z')
 }
 let resolve!: (rows: unknown[]) => void
 const pending = model.refresh(() => new Promise(r => { resolve = r }))
 model.invalidate()
 expect(model.increment()).toBe(false)
 await model.refresh(async () => Array(6))
 resolve(Array(5))
 expect(await pending).toBe(false)
 expect(model.count).toBe(6)
 expect(model.date).toBe(midnight ? '2026-11-01' : '2026-10-31')
})
it('failed restoration stays stale so visible date polling retries', async () => {
 const model = createDayCount(() => new Date('2026-11-01T04:00:00Z'))
 await expect(model.refresh(async () => { throw new Error('offline') })).rejects.toThrow('offline')
 expect(model.date).not.toBe('2026-11-01')
 expect(model.increment()).toBe(false)
 await model.refresh(async () => Array(5))
 expect(model.date).toBe('2026-11-01')
 expect(model.count).toBe(5)
})
it('coalesces slow same-day polling reads and accepts the original result', async () => {
 const model = createDayCount(() => new Date('2026-11-01T04:00:00Z'))
 let calls = 0, resolve!: (rows: unknown[]) => void
 const fetch = () => { calls++; return new Promise<unknown[]>(r => { resolve = r }) }
 const first = model.refresh(fetch)
 const ticks = [model.refresh(fetch), model.refresh(fetch), model.refresh(fetch)]
 expect(calls).toBe(1)
 resolve(Array(5))
 expect(await first).toBe(true)
 expect(await Promise.all(ticks)).toEqual([true, true, true])
 expect(model.count).toBe(5)
})

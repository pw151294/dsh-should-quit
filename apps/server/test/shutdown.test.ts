import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { coordinateShutdown } from '../src/shutdown.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}
it('SIGTERM waits active turn persistence then both apps including delayed internal close', async () => {
  const turn = deferred(), internalDone = deferred(), signals = new EventEmitter()
  const order: string[] = []
  const app = { get: () => ({ shutdown: async () => { await turn.promise; order.push('persisted') } }), close: vi.fn(async () => { order.push('public') }) }
  const internal = { close: vi.fn(async () => { await internalDone.promise; order.push('internal') }) }
  const owner = coordinateShutdown(app as never, internal, signals as never)
  signals.emit('SIGTERM')
  expect(app.close).not.toHaveBeenCalled()
  turn.resolve()
  await new Promise(resolve => setImmediate(resolve))
  expect(order).toEqual(['persisted', 'public'])
  let complete = false
  void owner.close().then(() => { complete = true })
  expect(complete).toBe(false)
  internalDone.resolve()
  await owner.close()
  expect(order).toEqual(['persisted', 'public', 'internal'])
  expect(app.close).toHaveBeenCalledTimes(1)
  owner.dispose()
})
it('always closes internal when public close rejects', async () => {
  const internal = { close: vi.fn(async () => {}) }, failed = vi.fn()
  const owner = coordinateShutdown({ get: () => ({ shutdown: async () => {} }), close: async () => { throw new Error('close') } } as never, internal, new EventEmitter() as never, failed)
  await expect(owner.close()).rejects.toThrow('close')
  expect(internal.close).toHaveBeenCalledTimes(1)
  owner.dispose()
})

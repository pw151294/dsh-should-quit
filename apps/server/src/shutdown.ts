import type { INestApplication } from '@nestjs/common'
import { AgentService } from './agent/agent.service.js'

export function coordinateShutdown(app: Pick<INestApplication, 'close' | 'get'>,
  internal: Pick<INestApplication, 'close'>,
  signals: Pick<NodeJS.Process, 'once' | 'removeListener'> = process,
  failed: () => void = () => { process.exitCode = 1 }) {
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => closing ??= (async () => {
    try {
      await app.get(AgentService).shutdown()
    } finally {
      try { await app.close() } finally { await internal.close() }
    }
  })()
  const signal = () => { void close().catch(failed) }
  signals.once('SIGTERM', signal)
  signals.once('SIGINT', signal)
  return { close, dispose: () => {
    signals.removeListener('SIGTERM', signal)
    signals.removeListener('SIGINT', signal)
  } }
}

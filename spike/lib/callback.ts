// spike/lib/callback.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'

export interface CallbackCall { sessionId: string; callId: string; at: number }

export interface CallbackServer {
  url: string
  token: string
  calls: CallbackCall[]
  /** 某会话的校验码；首次被问到时生成，之后固定 */
  codeFor(sessionId: string): string
  close(): Promise<void>
}

export async function startCallbackServer(): Promise<CallbackServer> {
  const token = randomBytes(16).toString('hex')
  const codes = new Map<string, string>()
  const calls: CallbackCall[] = []
  const codeFor = (sid: string): string => {
    let code = codes.get(sid)
    if (!code) {
      code = `SQ-${randomBytes(3).toString('hex').toUpperCase()}`
      codes.set(sid, code)
    }
    return code
  }

  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST' || req.headers['x-internal-token'] !== token) {
      res.writeHead(403).end()
      return
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      try {
        const { sessionId, callId } = JSON.parse(body) as { sessionId?: string; callId?: string }
        if (!sessionId) { res.writeHead(400).end(); return }
        calls.push({ sessionId, callId: String(callId ?? ''), at: Date.now() })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ code: codeFor(sessionId) }))
      } catch {
        res.writeHead(400).end()
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/tool`,
    token,
    calls,
    codeFor,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

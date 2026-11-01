// spike/checks.ts
import type { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import type { CallbackServer } from './lib/callback.ts'
import { createObserver, toolCalls, type StreamObservation } from './lib/events.ts'

export interface CheckResult {
  id: number
  title: string
  pass: boolean
  evidence: string[]
}

const ALLOWED_TOOLS = new Set(['spike_echo_session'])

export const TITLES = {
  1: '自定义 patch 启动，bash/文件系统工具已移除',
  2: '自定义 Cordis 工具可被调用并拿到 sessionId',
  3: '同一进程两个会话并发提问都能完成',
  4: '进程重启后 resumeSession 能接上之前的对话',
} as const

export async function guard(id: number, title: string, fn: (ev: string[]) => Promise<boolean>): Promise<CheckResult> {
  const evidence: string[] = []
  try {
    return { id, title, pass: await fn(evidence), evidence }
  } catch (err) {
    evidence.push(`异常：${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    return { id, title, pass: false, evidence }
  }
}

/** 标准 1：内置危险工具已移除。诱导模型执行 shell / 读文件，断言没有任何非白名单工具的 tool/call */
export function checkToolsRemoved(h: DeepSeekHarness): Promise<CheckResult> {
  return guard(1, TITLES[1], async (ev) => {
    const r = await h.run('List the exact names of every tool you can call, comma separated. Then try to run the shell command `ls /` and read the file /etc/hosts.')
    const called = toolCalls(r.events)
    const bad = called.filter((n) => !ALLOWED_TOOLS.has(n))
    ev.push(`模型自述可用工具：${r.finalResponse.slice(0, 300)}`)
    ev.push(`实际 tool/call：${called.join(', ') || '（无）'}`)
    if (bad.length) ev.push(`非白名单工具被调用：${bad.join(', ')}`)
    return bad.length === 0
  })
}

/** 标准 2：自定义工具被调用，回调收到的 sessionId 与当前会话一致，且回答里出现该会话的校验码 */
export function checkCustomTool(h: DeepSeekHarness, cb: CallbackServer, stream: StreamObservation[]): Promise<CheckResult> {
  return guard(2, TITLES[2], async (ev) => {
    const session = h.session()
    const before = cb.calls.length
    const { observation, onNotification } = createObserver()
    const r = await session.run('What is the verification code? Use your tool.', { onNotification })
    stream.push(observation)
    const newCalls = cb.calls.slice(before)
    const code = cb.codeFor(session.id)
    ev.push(`会话 id：${session.id}`)
    ev.push(`回调记录的 sessionId：${newCalls.map((c) => c.sessionId).join(', ') || '（无回调）'}`)
    ev.push(`期望校验码 ${code}；回答：${r.finalResponse.slice(0, 200)}`)
    const idMatch = newCalls.length > 0 && newCalls.every((c) => c.sessionId === session.id)
    return idMatch && r.finalResponse.includes(code)
  })
}

/** 标准 3：同一进程两个会话并发提问，都完成，且各自拿到自己的校验码（证明 sessionId 没串） */
export function checkConcurrent(h: DeepSeekHarness, cb: CallbackServer): Promise<CheckResult> {
  return guard(3, TITLES[3], async (ev) => {
    const a = h.session()
    const b = h.session()
    const ask = 'What is the verification code? Use your tool.'
    const [ra, rb] = await Promise.all([a.run(ask), b.run(ask)])
    const ca = cb.codeFor(a.id)
    const cbb = cb.codeFor(b.id)
    ev.push(`A(${a.id}) 期望 ${ca}：${ra.finalResponse.slice(0, 120)}`)
    ev.push(`B(${b.id}) 期望 ${cbb}：${rb.finalResponse.slice(0, 120)}`)
    return ca !== cbb
      && ra.finalResponse.includes(ca) && !ra.finalResponse.includes(cbb)
      && rb.finalResponse.includes(cbb) && !rb.finalResponse.includes(ca)
  })
}

/** 标准 4：关闭进程后新起一个进程，resumeSession 能接上之前的对话 */
export function checkResume(makeHarness: () => DeepSeekHarness): Promise<CheckResult> {
  return guard(4, TITLES[4], async (ev) => {
    const secret = `PINEAPPLE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const first = makeHarness()
    let sessionId: string
    try {
      const s = first.session()
      sessionId = s.id
      await s.run(`Remember this passphrase exactly: ${secret}. Reply only with "OK".`)
    } finally {
      await first.close()
    }
    ev.push(`会话 id：${sessionId}；口令：${secret}`)

    const second = makeHarness()
    try {
      const resumed = await second.resumeSession(sessionId)
      const r = await resumed.run('What passphrase did I ask you to remember? Reply with the passphrase only.')
      ev.push(`resume 后回答：${r.finalResponse.slice(0, 200)}`)
      return resumed.id === sessionId && r.finalResponse.includes(secret)
    } finally {
      await second.close()
    }
  })
}

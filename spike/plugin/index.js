// spike/plugin/index.js —— 纯 ESM，dsh 运行时直接 import，不经 TS 编译
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'should-quit-spike'
export const inject = ['tools']

export function apply(ctx) {
  const url = process.env.SPIKE_CALLBACK_URL
  const token = process.env.SPIKE_TOKEN
  if (!url || !token) throw new Error('SPIKE_CALLBACK_URL / SPIKE_TOKEN 未设置')

  // register 返回卸载函数；Spike 进程整体退出，不处理热卸载
  ctx.tools.register(defineTool({
    name: 'spike_echo_session',
    description: 'Returns a verification code for the current conversation. Call it whenever the user asks for the code.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      // exec.agent.id 即 SessionId（dsh-agent 中 Agent = { id: SessionId }）
      const sessionId = exec.agent?.id
      if (!sessionId) return 'ERROR: no agent on tool execution context'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': token },
        body: JSON.stringify({ sessionId: String(sessionId), callId: exec.callId }),
        signal: exec.signal,
      })
      if (!res.ok) return `ERROR: callback HTTP ${res.status}`
      const { code } = await res.json()
      return `code: ${code}`
    },
  }))
}

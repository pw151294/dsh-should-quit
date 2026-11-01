import Taro from '@tarojs/taro'
import { Utf8StreamDecoder, SseParser, parseAgentEvent, type AgentEvent } from '@should-quit/shared'
import { useAuth } from '../stores/auth'
import { ensureLogin } from './auth'
import { refreshAfter401, reportError, responseError } from './request'
export function askStream(id: string, text: string, onEvent: (event: AgentEvent) => void) {
  let cancel: (() => void) | undefined
  let aborted = false, task: Taro.RequestTask<unknown> | undefined
  const finished = (async () => {
    await ensureLogin()
    for (let attempt = 0; attempt < 2; attempt++) {
      if (aborted) throw new Error('连接已关闭')
      const token = useAuth.getState().token
      const result = await new Promise<{ status: number; data?: unknown; sse: boolean }>((resolve, reject) => {
        let settled = false
        const cleanup = () => { task?.offHeadersReceived?.(onHeaders); task?.offChunkReceived?.(onChunk) }
        const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error) }
        const finish = (value: { status: number; data?: unknown; sse: boolean }) => { if (settled) return; settled = true; cleanup(); resolve(value) }
        cancel = () => fail(new Error('连接已关闭'))
        const decoder = new Utf8StreamDecoder(), parser = new SseParser()
        let headers = false, sse = false, terminal = false, status = 0, json = '', bytes = false
        const early: Uint8Array[] = []
        const parseText = (value: string) => {
          for (const frame of parser.push(value)) {
            const event = parseAgentEvent(frame)
            if (!event || terminal) continue
            onEvent(event)
            if (event.type === 'error') void Taro.showToast({ title: event.message, icon: 'none' })
            if (event.type === 'done' || event.type === 'error') terminal = true
          }
        }
        const consume = (chunk: Uint8Array) => {
          const value = decoder.push(chunk)
          if (sse) parseText(value); else json += value
        }
        task = Taro.request({
          url: `${API_BASE_URL}/agent/conversations/${encodeURIComponent(id)}/messages`, method: 'POST',
          data: { text }, header: { Authorization: 'Bearer ' + token }, enableChunked: true, timeout: 320000,
          success: r => {
            if (settled || aborted) return
            status = status || r.statusCode
            if (!headers) {
              // 老基础库缺headers回调不猜测为SSE，返回升级提示。
              fail(new Error('请升级微信后使用顾问')); return
            }
            const tail = decoder.flush()
            if (sse) {
              parseText(tail)
              if (!terminal) { fail(new Error('回答中断，点此重试')); return }
              finish({ status, sse: true })
            } else {
              json += tail
              try { finish({ status, sse: false, data: bytes ? JSON.parse(json) : r.data }) }
              catch { fail(new Error('服务返回格式无效')) }
            }
          },
          fail: () => { if (terminal) finish({ status, sse }); else fail(new Error('回答中断，点此重试')) },
        })
        function onHeaders(r: { statusCode?: number; header: Record<string, unknown> }) {
          if (headers || settled || aborted) return
          headers = true; status = r.statusCode ?? 0
          const pair = Object.entries(r.header).find(([key]) => key.toLowerCase() === 'content-type')
          sse = status === 200 && String(pair?.[1]).toLowerCase().includes('text/event-stream')
          for (const chunk of early.splice(0)) consume(chunk)
        }
        function onChunk(r: { data: ArrayBuffer }) {
          if (aborted || settled) return
          bytes = true
          const chunk = new Uint8Array(r.data)
          if (headers) consume(chunk); else early.push(chunk)
        }
        task.onHeadersReceived(onHeaders)
        task.onChunkReceived(onChunk)
      })
      if (aborted) throw new Error('连接已关闭')
      if (result.sse) return
      if (result.status === 401 && attempt === 0) { await refreshAfter401(token); continue }
      return reportError(responseError(result.status, result.data))
    }
  })()
  return { finished, abort: () => { aborted = true; cancel?.(); task?.abort() } }
}

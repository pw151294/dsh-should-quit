// packages/shared/src/stream/sse.ts
export interface SseFrame {
  event: string
  data: string
}

/** 心跳：SSE 注释行，客户端解析时丢弃 */
export const SSE_PING = ': ping\n\n'

export function formatSseFrame(event: string, payload: unknown): string {
  // JSON.stringify 会转义换行，保证 data 只有一行
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

/** 增量 SSE 解析：push 任意切分的文本，返回已完整的帧 */
export class SseParser {
  private buffer = ''
  private event = ''
  private data: string[] = []

  push(text: string): SseFrame[] {
    this.buffer += text
    const frames: SseFrame[] = []
    let start = 0
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i]
      if (ch !== '\n' && ch !== '\r') continue
      // 末尾孤立 \r：若当前行非空则无法确认是否 \r\n，留到下一块
      if (ch === '\r' && i + 1 === this.buffer.length && i > start) break
      const line = this.buffer.slice(start, i)
      if (ch === '\r' && i + 1 < this.buffer.length && this.buffer[i + 1] === '\n') i++
      start = i + 1
      const frame = this.handleLine(line)
      if (frame) frames.push(frame)
    }
    this.buffer = this.buffer.slice(start)
    return frames
  }

  private handleLine(line: string): SseFrame | null {
    if (line === '') {
      const frame = this.data.length > 0 ? { event: this.event || 'message', data: this.data.join('\n') } : null
      this.event = ''
      this.data = []
      return frame
    }
    if (line.startsWith(':')) return null
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') this.event = value
    else if (field === 'data') this.data.push(value)
    // id / retry 本项目不用，忽略
    return null
  }
}

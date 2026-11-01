import { describe, expect, it } from 'vitest'
import { SSE_PING, SseParser, formatSseFrame, type SseFrame } from '../src/stream/sse.js'
import { Utf8StreamDecoder } from '../src/stream/utf8.js'

function parseAll(chunks: string[]): SseFrame[] {
  const p = new SseParser()
  return chunks.flatMap((c) => p.push(c))
}

const STREAM =
  formatSseFrame('tool', { type: 'tool', name: 'get_score_summary', label: '正在查看你的评分' })
  + SSE_PING
  + formatSseFrame('delta', { type: 'delta', text: '你现在 47 分，\n处在🟠骑驴找马。' })
  + formatSseFrame('done', { type: 'done', messageId: 'm1' })

const EXPECTED: SseFrame[] = [
  { event: 'tool', data: JSON.stringify({ type: 'tool', name: 'get_score_summary', label: '正在查看你的评分' }) },
  { event: 'delta', data: JSON.stringify({ type: 'delta', text: '你现在 47 分，\n处在🟠骑驴找马。' }) },
  { event: 'done', data: JSON.stringify({ type: 'done', messageId: 'm1' }) },
]

describe('formatSseFrame', () => {
  it('输出 event + 单行 data + 空行', () => {
    expect(formatSseFrame('done', { type: 'done', messageId: 'm1' }))
      .toBe('event: done\ndata: {"type":"done","messageId":"m1"}\n\n')
  })
  it('文本中的换行被转义，data 只有一行', () => {
    const f = formatSseFrame('delta', { text: 'a\nb' })
    expect(f.split('\n').filter((l) => l.startsWith('data:'))).toHaveLength(1)
  })
})

describe('SseParser', () => {
  it('整块解析，心跳被丢弃', () => {
    expect(parseAll([STREAM])).toEqual(EXPECTED)
  })
  it('在每个字符位置切成两块，结果一致', () => {
    for (let i = 0; i <= STREAM.length; i++) {
      expect(parseAll([STREAM.slice(0, i), STREAM.slice(i)])).toEqual(EXPECTED)
    }
  })
  it('与 UTF-8 解码器串联：在每个字节位置切开，结果一致', () => {
    const bytes = new TextEncoder().encode(STREAM)
    for (let i = 0; i <= bytes.length; i++) {
      const d = new Utf8StreamDecoder()
      const p = new SseParser()
      const frames = [...p.push(d.push(bytes.slice(0, i))), ...p.push(d.push(bytes.slice(i)) + d.flush())]
      expect(frames).toEqual(EXPECTED)
    }
  })
  it('支持 \\r\\n 行尾', () => {
    expect(parseAll(['event: done\r\ndata: {}\r\n\r\n'])).toEqual([{ event: 'done', data: '{}' }])
  })
  it('支持纯 \\r 行尾：\\r\\r 产出一帧', () => {
    expect(new SseParser().push('data: x\r\r')).toEqual([{ event: 'message', data: 'x' }])
  })
  it('支持纯 \\r 行尾：跨块传输', () => {
    const p = new SseParser()
    expect(p.push('data: x\r')).toEqual([])
    expect(p.push('\r')).toEqual([{ event: 'message', data: 'x' }])
  })
  it('支持混合 \\r 和 \\r\\n 行尾', () => {
    expect(parseAll(['event: a\rdata: 1\r\n\r\n'])).toEqual([{ event: 'a', data: '1' }])
  })
  it('没有 event 时默认为 message；没有 data 的帧不产出', () => {
    expect(parseAll(['data: x\n\n', 'event: lonely\n\n'])).toEqual([{ event: 'message', data: 'x' }])
  })
  it('多行 data 用 \\n 连接；冒号后只去掉一个空格', () => {
    expect(parseAll(['data: a\ndata:  b\n\n'])).toEqual([{ event: 'message', data: 'a\n b' }])
  })
  it('未结束的帧不产出，等到空行才产出', () => {
    const p = new SseParser()
    expect(p.push('event: done\ndata: {}\n')).toEqual([])
    expect(p.push('\n')).toEqual([{ event: 'done', data: '{}' }])
  })
})

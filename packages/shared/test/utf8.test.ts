import { describe, expect, it } from 'vitest'
import { Utf8StreamDecoder } from '../src/stream/utf8.js'

const TEXT = '你好 world，摸鱼🐟回血 ok'
const bytes = new TextEncoder().encode(TEXT)

function decodeAll(chunks: Uint8Array[]): string {
  const d = new Utf8StreamDecoder()
  return chunks.map((c) => d.push(c)).join('') + d.flush()
}

describe('Utf8StreamDecoder', () => {
  it('整块解码', () => {
    expect(decodeAll([bytes])).toBe(TEXT)
  })
  it('在每个字节位置切成两块，重组结果与原文一致', () => {
    for (let i = 0; i <= bytes.length; i++) {
      expect(decodeAll([bytes.slice(0, i), bytes.slice(i)])).toBe(TEXT)
    }
  })
  it('任意两个切点切成三块，结果一致', () => {
    for (let i = 0; i <= bytes.length; i++) {
      for (let j = i; j <= bytes.length; j++) {
        expect(decodeAll([bytes.slice(0, i), bytes.slice(i, j), bytes.slice(j)])).toBe(TEXT)
      }
    }
  })
  it('逐字节推送', () => {
    expect(decodeAll(Array.from(bytes, (b) => Uint8Array.of(b)))).toBe(TEXT)
  })
  it('不完整序列在下一块到来前不输出', () => {
    const d = new Utf8StreamDecoder()
    const ni = new TextEncoder().encode('你') // 3 字节
    expect(d.push(ni.slice(0, 2))).toBe('')
    expect(d.push(ni.slice(2))).toBe('你')
  })
  it('非法字节输出 U+FFFD，不影响后续文本', () => {
    expect(decodeAll([Uint8Array.of(0x80, 0x41)])).toBe('�A')
    expect(decodeAll([Uint8Array.of(0xc0, 0xaf, 0x41)])).toBe('��A') // 过长编码
    expect(decodeAll([Uint8Array.of(0xed, 0xa0, 0x80)])).toBe('���') // 代理区
  })
  it('flush 时残留不完整序列输出一个 U+FFFD', () => {
    const d = new Utf8StreamDecoder()
    expect(d.push(Uint8Array.of(0xe4, 0xbd))).toBe('')
    expect(d.flush()).toBe('�')
    expect(d.flush()).toBe('')
  })
})

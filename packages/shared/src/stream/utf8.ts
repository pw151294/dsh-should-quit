// packages/shared/src/stream/utf8.ts
const REPLACEMENT = '�'

/** 流式 UTF-8 解码：不完整的尾部字节留到下一次 push */
export class Utf8StreamDecoder {
  private codePoint = 0
  private needed = 0
  private seen = 0
  private lower = 0x80
  private upper = 0xbf

  push(chunk: Uint8Array): string {
    let out = ''
    let i = 0
    while (i < chunk.length) {
      const b = chunk[i]!
      if (this.needed === 0) {
        i++
        if (b <= 0x7f) {
          out += String.fromCharCode(b)
        } else if (b >= 0xc2 && b <= 0xdf) {
          this.needed = 1
          this.codePoint = b & 0x1f
        } else if (b >= 0xe0 && b <= 0xef) {
          if (b === 0xe0) this.lower = 0xa0
          if (b === 0xed) this.upper = 0x9f
          this.needed = 2
          this.codePoint = b & 0x0f
        } else if (b >= 0xf0 && b <= 0xf4) {
          if (b === 0xf0) this.lower = 0x90
          if (b === 0xf4) this.upper = 0x8f
          this.needed = 3
          this.codePoint = b & 0x07
        } else {
          out += REPLACEMENT
        }
        continue
      }
      if (b < this.lower || b > this.upper) {
        // 不消费当前字节（i 不前进），重置后把它当作新序列的开头
        this.reset()
        out += REPLACEMENT
        continue
      }
      i++
      this.lower = 0x80
      this.upper = 0xbf
      this.codePoint = (this.codePoint << 6) | (b & 0x3f)
      this.seen++
      if (this.seen === this.needed) {
        out += String.fromCodePoint(this.codePoint)
        this.reset()
      }
    }
    return out
  }

  /** 流结束时调用；残留的不完整序列输出一个 U+FFFD */
  flush(): string {
    if (this.needed === 0) return ''
    this.reset()
    return REPLACEMENT
  }

  private reset(): void {
    this.codePoint = 0
    this.needed = 0
    this.seen = 0
    this.lower = 0x80
    this.upper = 0xbf
  }
}

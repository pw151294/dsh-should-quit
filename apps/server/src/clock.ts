// apps/server/src/clock.ts
import { localDate } from '@should-quit/shared'

export abstract class Clock {
  abstract now(): Date
  /** Asia/Shanghai 本地日期 'YYYY-MM-DD' */
  today(): string {
    return localDate(this.now())
  }
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date()
  }
}

/** 测试用：固定时间，可手动推进 */
export class FixedClock extends Clock {
  private at: Date
  constructor(at: Date) {
    super()
    this.at = new Date(at.getTime()) // 复制，避免调用方修改原对象
  }
  now(): Date {
    return new Date(this.at.getTime())
  }
  set(at: Date): void {
    this.at = new Date(at.getTime())
  }
  advanceDays(n: number): void {
    this.at = new Date(this.at.getTime() + n * 24 * 60 * 60 * 1000)
  }
}

// apps/server/src/db-date.ts
import { shiftDate } from '@should-quit/shared'

/** 'YYYY-MM-DD' → @db.Date 列使用的 UTC 零点 Date */
export function toDbDate(date: string): Date {
  shiftDate(date, 0) // 非法日期在这里抛错
  return new Date(`${date}T00:00:00.000Z`)
}

/** @db.Date 列读出的 Date → 'YYYY-MM-DD' */
export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

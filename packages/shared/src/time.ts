// packages/shared/src/time.ts
export const APP_TZ = 'Asia/Shanghai'

/** Asia/Shanghai 固定 UTC+8，无夏令时 */
const OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function formatUtcDate(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 把 'YYYY-MM-DD' 解析为该日 UTC 零点的毫秒数；格式或日期非法时抛错 */
function parseDate(s: string): number {
  const m = DATE_RE.exec(s)
  if (!m) throw new Error(`invalid date: ${s}`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const ms = Date.UTC(y, mo - 1, d)
  // 拦住 2026-02-30 这类会被 Date.UTC 静默进位的日期
  if (formatUtcDate(new Date(ms)) !== s) throw new Error(`invalid date: ${s}`)
  return ms
}

/** 某个时刻在 Asia/Shanghai 的本地日期，格式 'YYYY-MM-DD' */
export function localDate(at: Date): string {
  if (Number.isNaN(at.getTime())) throw new Error(`invalid date: ${at}`)
  return formatUtcDate(new Date(at.getTime() + OFFSET_MS))
}

/** to − from 的自然日差 */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS)
}

/** 日期加减 n 天 */
export function shiftDate(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error(`invalid days: ${days}`)
  return formatUtcDate(new Date(parseDate(date) + days * DAY_MS))
}

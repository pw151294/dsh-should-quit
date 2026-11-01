import { localDate } from '@should-quit/shared'
export function createDayCount(now = () => new Date()) {
 let restoredDate = '', version = 0, count = 0
 let pending: { day: string; ticket: number; promise: Promise<boolean> } | undefined
 return {
  get date() { return restoredDate },
  get count() { return count },
  get refreshing() { return pending?.day === localDate(now()) && pending.ticket === version },
  invalidate() { ++version },
  refresh(fetch: (date: string) => Promise<unknown[]>) {
   const day = localDate(now())
   if (pending?.day === day && pending.ticket === version) return pending.promise
   const ticket = ++version
   const promise = (async () => {
    const rows = await fetch(day)
    if (ticket !== version || day !== localDate(now())) return false
    restoredDate = day
    count = rows.length
    return true
   })().finally(() => { if (pending?.ticket === ticket) pending = undefined })
   pending = { day, ticket, promise }
   return promise
  },
  increment() { ++version; if (restoredDate !== localDate(now())) return false; ++count; return true },
 }
}
export function singleFlight() {
 let busy = false
 return async (action: () => Promise<void>) => {
  if (busy) return
  busy = true
  try { await action() } finally { busy = false }
 }
}

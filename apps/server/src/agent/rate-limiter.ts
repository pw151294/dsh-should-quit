export class RateLimiter {
  private users = new Map<string, number[]>()
  take(userId: string, nowMs: number): boolean {
    // 清理过期用户。
    for (const [id, times] of this.users) {
      const live = times.filter(t => t > nowMs - 3_600_000)
      if (live.length) this.users.set(id, live)
      else this.users.delete(id)
    }
    const times = this.users.get(userId) ?? []
    if (times.length >= 30) return false
    times.push(nowMs)
    this.users.set(userId, times)
    return true
  }
}

export class AsyncQueue<T> implements AsyncIterable<T> {
  private values: T[] = []
  private waiters: Array<{ resolve: (r: IteratorResult<T>) => void; reject: (e: unknown) => void }> = []
  private ended = false
  private failed = false
  private error: unknown
  push(value: T): void {
    if (this.ended) return
    const waiter = this.waiters.shift()
    if (waiter) waiter.resolve({ value, done: false })
    else this.values.push(value)
  }
  end(): void {
    if (this.ended) return
    this.ended = true
    for (const w of this.waiters.splice(0)) w.resolve({ value: undefined, done: true })
  }
  fail(error: unknown): void {
    if (this.ended) return
    this.failed = true
    this.error = error
    this.ended = true
    for (const w of this.waiters.splice(0)) w.reject(error)
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: () => {
      if (this.values.length) return Promise.resolve({ value: this.values.shift()!, done: false })
      if (this.failed) return Promise.reject(this.error)
      if (this.ended) return Promise.resolve({ value: undefined, done: true })
      return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
    } }
  }
}

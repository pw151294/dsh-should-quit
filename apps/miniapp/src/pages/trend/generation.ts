export function latestRequest() {
  let version = 0
  return {
    begin() { const current = ++version; return () => current === version },
    cancel() { version++ },
  }
}

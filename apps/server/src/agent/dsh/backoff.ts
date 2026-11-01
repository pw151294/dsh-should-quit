export const restartDelay = (attempt: number): number => Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))

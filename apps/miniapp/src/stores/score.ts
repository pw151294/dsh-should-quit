import { create } from 'zustand'
import type { ScoreView } from '@should-quit/shared'
export const useScore = create<{ score: ScoreView | null; setScore(score: ScoreView | null): void }>(set => ({
  score: null, setScore: score => set({ score }),
}))

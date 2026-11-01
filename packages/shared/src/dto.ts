// packages/shared/src/dto.ts
import { z } from 'zod'
import { BASELINE_FIELDS, type BaselineField } from './scoring/objective.js'
import type { ScoreResult, Tier } from './scoring/total.js'
import type { ErrorCode } from './errors.js'
import { shiftDate } from './time.js'

const level = z.number().int().min(1).max(5)

export const baselineSchema = z.strictObject(
  Object.fromEntries(BASELINE_FIELDS.map((f) => [f, level])) as Record<BaselineField, typeof level>,
)

export const moodCreateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
})

export const dailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
})

export const trendQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
})
export type TrendRange = z.infer<typeof trendQuerySchema>['range']
export const TREND_RANGE_DAYS: Record<TrendRange, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** 合法的 YYYY-MM-DD；shiftDate(d, 0) 会对格式错误或 02-30 这类日期抛错 */
export const dateString = z.string().refine((d) => {
  try {
    return shiftDate(d, 0) === d
  } catch {
    return false
  }
}, 'invalid date')

export const moodDateQuerySchema = z.object({ date: dateString })

export const askSchema = z.object({ text: z.string().trim().min(1).max(500) })

export const loginSchema = z.object({ code: z.string().min(1).max(128) })

export type BaselineBody = z.infer<typeof baselineSchema>
export type MoodCreateBody = z.infer<typeof moodCreateSchema>
export type AskBody = z.infer<typeof askSchema>

// ---- 响应类型 ----

export interface TierCopy { label: string; slogan: string; guidance: string }

/** GET /api/score/current，以及 PUT /api/baseline、POST /api/moods 的返回 */
export interface ScoreView extends ScoreResult { copy: TierCopy }

export interface UserView { id: string; nickname: string | null; avatarUrl: string | null }
export interface LoginResponse { token: string; user: UserView; hasBaseline: boolean }

/** GET /api/baseline；未录入时 baseline 为 null */
export interface BaselineResponse { baseline: BaselineBody | null }

export interface MoodDailyItem { date: string; avg: number; count: number }
export interface MoodItem { id: string; stars: number; note: string | null; createdAt: string }

export interface TrendPoint { date: string; totalScore: number; tier: Tier; objectiveScore: number; moodScore: number | null }
export interface TrendResponse { before: TrendPoint | null; items: TrendPoint[] }

export interface ConversationView { id: string; title: string | null; createdAt: string; lastMessageAt: string }
export type MessageRole = 'USER' | 'ASSISTANT'
export type MessageStatus = 'COMPLETE' | 'FAILED' | 'INTERRUPTED'
export interface MessageView { id: string; role: MessageRole; content: string; status: MessageStatus; createdAt: string }
export interface AgentConfigView { presetQuestions: string[] }

/** SSE 事件负载（event 名即 type） */
export type AgentEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; label: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; code: ErrorCode; message: string }

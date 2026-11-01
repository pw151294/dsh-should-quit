import { z } from 'zod'
export const AGENT_TOOL_NAMES = ['get_score_summary', 'get_baseline', 'get_mood_history', 'get_score_trend'] as const
export type AgentToolName = typeof AGENT_TOOL_NAMES[number]
export const agentToolNameSchema = z.enum(AGENT_TOOL_NAMES)
export const toolArgsSchemas = {
  get_score_summary: z.strictObject({}),
  get_baseline: z.strictObject({}),
  get_mood_history: z.strictObject({ days: z.number().int().min(1).max(90).default(30) }),
  get_score_trend: z.strictObject({ range: z.enum(['7d', '30d', '90d']).default('30d') }),
}

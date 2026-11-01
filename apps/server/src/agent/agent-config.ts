import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { AGENT_TOOL_NAMES, type AgentToolName, type AgentConfigView } from '@should-quit/shared'
export const AGENT_CONFIG = Symbol('AGENT_CONFIG')
export interface AgentConfig {
  prompt: string; publicConfig: AgentConfigView; toolLabels: Record<AgentToolName, string>
}
const labelSchema = z.strictObject(Object.fromEntries(
  AGENT_TOOL_NAMES.map(n => [n, z.string().trim().min(1)]),
) as Record<AgentToolName, z.ZodString>)
const schema = z.strictObject({
  hotline: z.string().trim().min(1),
  presetQuestions: z.array(z.string().trim().min(1)).min(1),
  toolLabels: labelSchema,
})
export function parseAgentConfig(raw: unknown, template: string): AgentConfig {
  const data = schema.parse(raw)
  if (!template.includes('{{hotline}}')) throw new Error('missing hotline placeholder')
  const prompt = template.replaceAll('{{hotline}}', data.hotline)
  if (/\{\{.*?\}\}/s.test(prompt)) throw new Error('unresolved prompt placeholder')
  return { prompt, publicConfig: { presetQuestions: data.presetQuestions }, toolLabels: data.toolLabels }
}
export function loadAgentConfig(): AgentConfig {
  // 从服务工作目录读取。
  return parseAgentConfig(JSON.parse(readFileSync(resolve('config/agent.json'), 'utf8')),
    readFileSync(resolve('config/agent-prompt.md'), 'utf8'))
}

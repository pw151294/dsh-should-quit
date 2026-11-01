import { relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
export const FORBIDDEN_ROWS = [
  'tool-bash', 'tool-pwsh', 'tool-jobs', 'tool-fs', 'tool-fs-search', 'tool-web',
  'tool-subagent', 'tool-subagent-fork', 'tool-subagent-control', 'tool-subagent-list-agents',
  'tool-workflow', 'tool-todo', 'tool-goal', 'tool-skill', 'tool-working-directory',
] as const
export function makePatch(prompt: string, mode: 'dsh-tools' | 'dsh-context', patchPath: string) {
  const plugin = relative(dirname(patchPath), fileURLToPath(new URL('../../../../agent-plugin/dist/index.js', import.meta.url))).replaceAll('\\', '/')
  return [
    ...(mode === 'dsh-tools' ? [{ insert: [{ id: 'should-quit', name: plugin.startsWith('.') ? plugin : './' + plugin, config: {} }] }] : []),
    ...FORBIDDEN_ROWS.map(id => ({ id, disabled: true })),
    // Spike实际报告中残留exit_plan_mode；禁用已确认存在的服务行以确保只有业务工具。
    { id: 'plan-mode', disabled: true },
    { id: 'system-prompt', config: { includeHarnessIdentity: false, personaPrefix: prompt, personaSuffix: '' } },
  ]
}

// spike/report.ts
import type { CheckResult } from './checks.ts'
import type { StreamObservation } from './lib/events.ts'

export interface SpikeReport {
  startedAt: string
  platform: string
  nodeVersion: string
  checks: CheckResult[]
  stream: StreamObservation[]
  stderrWarnings: string[]
}

export function decision(checks: CheckResult[]): 'dsh-tools' | 'dsh-context' {
  return checks.length === 5 && checks.every((c) => c.pass) ? 'dsh-tools' : 'dsh-context'
}

export function renderMarkdown(r: SpikeReport): string {
  const lines: string[] = []
  const engine = decision(r.checks)
  lines.push('# dsh 技术验证结果', '')
  lines.push(`- 时间：${r.startedAt}`)
  lines.push(`- 平台：${r.platform}；Node ${r.nodeVersion}`)
  lines.push(`- 结论：\`AGENT_ENGINE=${engine}\``, '')
  lines.push('| # | 标准 | 结果 |', '|---|---|---|')
  for (const c of [...r.checks].sort((a, b) => a.id - b.id)) {
    lines.push(`| ${c.id} | ${c.title} | ${c.pass ? 'PASS' : 'FAIL'} |`)
  }
  lines.push('', '## 证据', '')
  for (const c of [...r.checks].sort((a, b) => a.id - b.id)) {
    lines.push(`### ${c.id}. ${c.title}`, '')
    for (const e of c.evidence) lines.push(`- ${e.replace(/\n/g, ' ')}`)
    lines.push('')
  }
  lines.push('## 流式粒度（不参与判定）', '')
  for (const [i, o] of r.stream.entries()) {
    const gaps = o.assistantMessages.map((m, j, arr) => (j === 0 ? 0 : m.at - arr[j - 1].at))
    lines.push(`- 观察 ${i + 1}：assistant/message ${o.assistantMessages.length} 条，文本长度 ${o.assistantMessages.map((m) => m.textLength).join('/')}，间隔 ms ${gaps.join('/')}`)
    lines.push(`  - 其他通知：${[...o.otherMethods].join(', ') || '（无）'}`)
  }
  lines.push('', '每个 step 结束才到一条 assistant/message，说明只能按 step 推送；Phase 4 的 `delta` 事件按 step 粒度发送。', '')
  lines.push('## patch 警告（stderr）', '')
  lines.push(...(r.stderrWarnings.length ? r.stderrWarnings.map((w) => `- ${w}`) : ['- （无）']))
  lines.push('', '## 人工备注', '', '（执行人补充：异常现象、绕过办法、对 Phase 4 的影响）', '')
  return lines.join('\n')
}

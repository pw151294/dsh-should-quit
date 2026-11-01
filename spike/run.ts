// spike/run.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startCallbackServer } from './lib/callback.ts'
import { createHarness } from './lib/harness.ts'
import type { StreamObservation } from './lib/events.ts'
import { checkToolsRemoved, checkCustomTool, checkConcurrent, checkResume, guard, TITLES, type CheckResult } from './checks.ts'
import { renderMarkdown, decision, type SpikeReport } from './report.ts'

const root = dirname(fileURLToPath(import.meta.url))
const docPath = join(root, '..', 'docs', 'superpowers', 'spike-result.md')

async function main(): Promise<void> {
  const startedAt = new Date().toISOString()
  const cb = await startCallbackServer()
  const stream: StreamObservation[] = []
  const checks: CheckResult[] = []

  try {
    const harness = createHarness(cb)

    try {
      const started = await guard(5, `本机 ${process.platform} 上子进程能正常启动`, async (ev) => {
        const t0 = Date.now()
        await harness.start()
        ev.push(`initialize 握手耗时 ${Date.now() - t0} ms`)
        return true
      })
      checks.push(started)

      if (started.pass) {
        checks.push(await checkToolsRemoved(harness))
        checks.push(await checkCustomTool(harness, cb, stream))
        checks.push(await checkConcurrent(harness, cb))
      } else {
        for (const [id, title] of [[1, TITLES[1]], [2, TITLES[2]], [3, TITLES[3]]] as const) {
          checks.push({ id, title, pass: false, evidence: ['子进程未能启动，跳过'] })
        }
      }
    } finally {
      await harness.close()
    }

    // 标准 4 自己管理两个 harness 的生命周期，放在主 harness 关闭之后，避免同一 dshHome 下两个进程争用会话
    if (checks.find((c) => c.id === 5)?.pass) {
      checks.push(await checkResume(() => createHarness(cb)))
    } else {
      checks.push({ id: 4, title: TITLES[4], pass: false, evidence: ['子进程未能启动，跳过'] })
    }
  } finally {
    await cb.close()
  }

  const report: SpikeReport = {
    startedAt,
    platform: `${process.platform}-${process.arch}`,
    nodeVersion: process.version,
    checks,
    stream,
    stderrWarnings: [],
  }
  writeFileSync(join(root, 'result.json'), JSON.stringify(report, (_k, v) => (v instanceof Set ? [...v] : v), 2))
  mkdirSync(dirname(docPath), { recursive: true })
  writeFileSync(docPath, renderMarkdown(report))

  for (const c of [...checks].sort((a, b) => a.id - b.id)) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}. ${c.title}`)
  }
  console.log(`\nAGENT_ENGINE=${decision(checks)}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

// apps/server/test/setup/global.ts
import { execFileSync } from 'node:child_process'
import { assertTestDatabase } from './test-db.js'

export default function setup(): void {
  try { process.loadEnvFile('.env') } catch { /* CI 用进程环境 */ }
  const url = process.env.DATABASE_URL_TEST
  assertTestDatabase(url)
  // 用参数数组调用，不经 shell 拼接
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}

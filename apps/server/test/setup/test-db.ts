// apps/server/test/setup/test-db.ts
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../../src/generated/prisma/client.js'
import { withUtcSession } from '../../src/prisma/connection-url.js'

/** 从连接串取库名，不以 _test 结尾时抛错 */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL_TEST 未设置')
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!name.endsWith('_test')) throw new Error(`拒绝在非测试库上运行：${name}`)
  return name
}

/** 清空全部业务表（保留 _prisma_migrations） */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL)
  const tables = ['AgentMessage', 'AgentConversation', 'ScoreSnapshot', 'MoodCheckin', 'Baseline', 'User']
  // schema 无外键，直接 TRUNCATE；不改会话变量，避免连接池里残留 FK_CHECKS=0
  for (const t of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``)
}

export function createTestPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL
  assertTestDatabase(url)
  return new PrismaClient({ adapter: new PrismaMariaDb(withUtcSession(url!)) })
}

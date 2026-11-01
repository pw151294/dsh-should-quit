// apps/server/prisma7.config.ts
import { defineConfig } from 'prisma/config'

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env') } catch { /* 没有 .env 时用进程环境 */ }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // generate 不需要连接串；migrate 命令缺少它时 Prisma 会明确报错
  datasource: { url: process.env.DATABASE_URL ?? '' },
})

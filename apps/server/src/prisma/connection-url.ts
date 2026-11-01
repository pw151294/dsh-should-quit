// apps/server/src/prisma/connection-url.ts

/** 给 mysql:// 连接串加上 timezone=+00:00 */
export function withUtcSession(url: string): string {
  // 会话固定 UTC，避免 DB 端 NOW()/CURRENT_TIMESTAMP 按 UTC+8 写入
  const u = new URL(url)
  u.searchParams.set('timezone', '+00:00')
  return u.toString()
}

// apps/server/src/prisma/errors.ts
/** Prisma 已知错误码判断，例如 P2002 唯一约束冲突 */
export function hasPrismaCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code
}

/** MySQL 上 upsert 先查后插，并发首写会撞唯一索引；P2002 时重试一次（此时走 update 分支） */
export async function retryOnUniqueConflict<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (e) {
    if (!hasPrismaCode(e, 'P2002')) throw e
    return op()
  }
}

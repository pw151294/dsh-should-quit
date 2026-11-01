import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { assertTestDatabase, createTestPrisma, truncateAll } from './setup/test-db.js'

describe('test-db', () => {
  const prisma = createTestPrisma()
  beforeEach(() => truncateAll(prisma)) // 不依赖上次遗留数据
  afterAll(() => prisma.$disconnect())

  it('非 _test 库被拒绝', () => {
    expect(() => assertTestDatabase('mysql://root:@127.0.0.1:3306/should_quit')).toThrow(/拒绝/)
    expect(assertTestDatabase('mysql://root:@127.0.0.1:3306/should_quit_test')).toBe('should_quit_test')
  })
  it('迁移已部署，可写入并清空', async () => {
    await prisma.user.create({ data: { openid: 'mock_t1' } })
    expect(await prisma.user.count()).toBe(1)
    await truncateAll(prisma)
    expect(await prisma.user.count()).toBe(0)
  })
  it('truncateAll 后连接池中所有连接的外键检查仍为开启', async () => {
    await truncateAll(prisma)
    // 并发查询以覆盖池中多条连接
    const rows = await Promise.all(
      Array.from({ length: 10 }, () =>
        prisma.$queryRawUnsafe<{ f: bigint | number }[]>('SELECT @@session.foreign_key_checks AS f'),
      ),
    )
    for (const [row] of rows) expect(Number(row?.f)).toBe(1)
  })
  it('utf8mb4：emoji 备注可往返', async () => {
    const u = await prisma.user.create({ data: { openid: 'mock_t2' } })
    const m = await prisma.moodCheckin.create({
      data: { userId: u.id, stars: 3, note: '摸鱼🐟', checkinDate: new Date('2026-10-31T00:00:00Z') },
    })
    expect((await prisma.moodCheckin.findUniqueOrThrow({ where: { id: m.id } })).note).toBe('摸鱼🐟')
    await truncateAll(prisma)
  })
  it('会话时区固定 UTC', async () => {
    const [row] = await prisma.$queryRawUnsafe<{ tz: string }[]>('SELECT @@session.time_zone AS tz')
    expect(row?.tz).toBe('+00:00')
    const [d] = await prisma.$queryRawUnsafe<{ diff: bigint | number }[]>(
      'SELECT TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP()) AS diff',
    )
    expect(Math.abs(Number(d?.diff))).toBeLessThanOrEqual(1)
  })
  it('openid 区分大小写（utf8mb4_bin）', async () => {
    await prisma.user.create({ data: { openid: 'mock_abc' } })
    const upper = await prisma.user.create({ data: { openid: 'mock_ABC' } })
    expect(await prisma.user.count()).toBe(2)
    expect((await prisma.user.findUnique({ where: { openid: 'mock_ABC' } }))?.id).toBe(upper.id)
  })
})

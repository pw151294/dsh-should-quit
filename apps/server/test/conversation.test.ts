import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ConversationService } from '../src/agent/conversation.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { createTestApp, loginAs, type TestApp } from './helpers.js'
let t: TestApp, db: PrismaService, service: ConversationService, uid: string
beforeAll(async () => {
  t = await createTestApp(); db = t.app.get(PrismaService)
  uid = (await loginAs(t, 'conversation-owner')).userId
  service = new ConversationService(db, { createSessionId: randomUUID })
})
afterAll(async () => { await t?.close() })
it('owns, orders and atomically replaces independent sessions', async () => {
  const a = await service.create(uid), b = await service.create(uid)
  const row = await service.owned(uid, a.id)
  expect(row.dshSessionId).not.toBe((await service.owned(uid, b.id)).dshSessionId)
  for (const id of [a.id, 'missing']) await expect(service.owned('other', id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(service.messages('other', a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await db.agentConversation.update({ where: { id: a.id }, data: { lastMessageAt: new Date('2030-01-01Z') } })
  expect((await service.list(uid))[0]!.id).toBe(a.id)
  await service.replaceSession(a.id, row.dshSessionId, randomUUID())
  expect(await db.agentConversation.findUnique({ where: { dshSessionId: row.dshSessionId } })).toBeNull()
  await expect(service.replaceSession(a.id, row.dshSessionId, randomUUID())).rejects.toThrow('concurrently')
})
it('keeps ten rounds with statuses, excludes only the explicit current message', async () => {
  const c = await service.create(uid)
  for (let i = 0; i < 12; i++) for (const role of ['USER', 'ASSISTANT'] as const) {
    await db.agentMessage.create({ data: { conversationId: c.id, role, status: role === 'USER' ? 'COMPLETE' : 'INTERRUPTED', content: `${role}-${i}`, createdAt: new Date(1000 * (i * 2 + (role === 'USER' ? 0 : 1))) } })
  }
  const current = await db.agentMessage.create({ data: { conversationId: c.id, role: 'USER', status: 'COMPLETE', content: 'current', createdAt: new Date() } })
  const h = await service.history(uid, c.id, current.id)
  expect(h).not.toContain('current'); expect(h).not.toContain('USER-1"')
  expect(h).toContain('USER-2"'); expect(h).toContain('INTERRUPTED')
  expect(await service.history(uid, c.id)).toContain('current')
  expect((await service.messages(uid, c.id)).map(m => m.content).slice(0, 2)).toEqual(['USER-0', 'ASSISTANT-0'])
})

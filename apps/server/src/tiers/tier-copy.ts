// apps/server/src/tiers/tier-copy.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { Tier, TierCopy } from '@should-quit/shared'

export const DEFAULT_TIERS_PATH = fileURLToPath(new URL('../../config/tiers.json', import.meta.url))

/** Nest 注入令牌 */
export const TIER_COPY = Symbol('TIER_COPY')
export type TierCopyMap = Record<Tier, TierCopy>

const text = z.string().trim().min(1, '不能为空')
const copy = z.strictObject({ label: text, slogan: text, guidance: text })
const schema = z.strictObject({ RUN: copy, SEEK: copy, WATCH: copy, STAY: copy })

export function parseTierCopy(raw: unknown): TierCopyMap {
  const r = schema.safeParse(raw)
  if (!r.success) {
    const lines = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`tiers.json 校验失败：\n${lines.join('\n')}`)
  }
  return r.data
}

export function loadTierCopy(path: string = DEFAULT_TIERS_PATH): TierCopyMap {
  return parseTierCopy(JSON.parse(readFileSync(path, 'utf8')))
}

import { describe, expect, it } from 'vitest'
import { DEFAULT_TIERS_PATH, loadTierCopy, parseTierCopy } from '../src/tiers/tier-copy.js'

const ok = { label: 'l', slogan: 's', guidance: 'g' }

describe('tier copy', () => {
  it('仓库内的 tiers.json 四档齐全', () => {
    const copy = loadTierCopy(DEFAULT_TIERS_PATH)
    expect(Object.keys(copy).sort()).toEqual(['RUN', 'SEEK', 'STAY', 'WATCH'])
    expect(copy.SEEK.slogan).toBe('骑驴找马，悄悄看机会')
  })
  it('缺档位、字段为空、多余字段都拒绝', () => {
    expect(() => parseTierCopy({ RUN: ok, SEEK: ok, WATCH: ok })).toThrow(/STAY/)
    expect(() => parseTierCopy({ RUN: ok, SEEK: ok, WATCH: ok, STAY: { ...ok, slogan: '  ' } })).toThrow(/STAY\.slogan/)
    expect(() => parseTierCopy({ RUN: ok, SEEK: ok, WATCH: ok, STAY: ok, EXTRA: ok })).toThrow()
  })
})

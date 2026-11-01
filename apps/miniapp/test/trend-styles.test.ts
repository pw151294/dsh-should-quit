import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
it.runIf(process.env.VERIFY_WEAPP_BUILD === '1')('ships calendar and bottom-sheet styles in the compiled trend page', () => {
  const artifact = resolve('dist/pages/trend/index.wxss')
  expect(existsSync(artifact)).toBe(true)
  const css = readFileSync(artifact, 'utf8')
  expect(css).toMatch(/grid-template-columns:repeat\(7,\s*minmax\(0,\s*1fr\)\)/)
  for (const color of ['red', 'orange', 'yellow', 'green', 'gray']) {
    expect(css).toMatch(new RegExp(`\\.day\\.${color}\\{[^}]*background`))
  }
  expect(css).toMatch(/\.calendar \.day\[disabled\]\{[^}]*color:/)
  expect(css).toMatch(/min-height:44px/i)
  expect(css).toMatch(/\.sheet\{[^}]*position:fixed/)
  expect(css).toMatch(/\.sheet\{[^}]*bottom:0/)
  expect(css).toMatch(/\.sheet\{[^}]*max-height:75vh/)
  expect(css).toContain('overflow-y:auto')
  expect(css).toContain('env(safe-area-inset-bottom)')
})

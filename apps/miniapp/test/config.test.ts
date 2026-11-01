import { expect, it, vi } from 'vitest'
const routes = ['launch', 'baseline', 'home', 'trend', 'advisor', 'chat', 'mine'].map(p => `pages/${p}/index`)
it('registers seven routes, four ordered tabs and a 320s timeout', async () => {
  vi.stubGlobal('defineAppConfig', (value: unknown) => value)
  const { default: config } = await import('../src/app.config')
  expect(config.pages).toEqual(routes)
  expect(config.tabBar!.list.map(t => t.text)).toEqual(['首页', '趋势', '顾问', '我的'])
  expect(config.tabBar!.list.map(t => t.pagePath)).toEqual(['home', 'trend', 'advisor', 'mine'].map(p => `pages/${p}/index`))
  expect(config.networkTimeout!.request).toBe(320000)
})

it.runIf(process.env.VERIFY_WEAPP_BUILD === '1')('emits app.json and all seven page artifacts', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const built = JSON.parse(readFileSync(resolve('dist/app.json'), 'utf8'))
  expect(built.pages).toEqual(routes)
  for (const route of routes) {
    for (const extension of ['js', 'json', 'wxml']) expect(existsSync(resolve(`dist/${route}.${extension}`))).toBe(true)
  }
})

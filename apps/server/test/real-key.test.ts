import { expect, it } from 'vitest'
import { realKey } from './real-key.js'
it('missing env reaches no-Key skip and preserves supplied process Key', () => {
  const absent = '/nonexistent/should-quit-test/env'
  expect(realKey({}, absent)).toBe('')
  expect(realKey({ DEEPSEEK_API_KEY: 'test-placeholder' }, absent)).toBe('test-placeholder')
})

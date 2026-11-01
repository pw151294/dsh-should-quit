import { mergeConfig, defineConfig } from 'vitest/config'
import base from './vitest.config.js'
import { realKey } from './test/real-key.js'
export default mergeConfig(base, defineConfig({ test: {
  include: ['test/agent-real.e2e.test.ts'],
  env: { REAL_AGENT_KEY: realKey() },
  testTimeout: 240_000,
} }))

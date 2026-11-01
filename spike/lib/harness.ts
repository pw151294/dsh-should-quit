// spike/lib/harness.ts
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import type { CallbackServer } from './callback.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
export const DSH_HOME = join(root, '.dsh-home')
export const WORKSPACE = join(root, 'workspace')
export const PATCH = join(root, 'spike.cordis.yml')

export function createHarness(cb: CallbackServer): DeepSeekHarness {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未设置')
  mkdirSync(DSH_HOME, { recursive: true })
  mkdirSync(WORKSPACE, { recursive: true })
  return new DeepSeekHarness({
    profile: 'sdk',
    patches: [PATCH],
    dshHome: DSH_HOME,
    cwd: WORKSPACE,
    processCwd: root,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    maxTokens: 2048,
    initializeTimeoutMs: 60_000,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      DEEPSEEK_API_KEY: apiKey,
      SPIKE_CALLBACK_URL: cb.url,
      SPIKE_TOKEN: cb.token,
    },
  })
}

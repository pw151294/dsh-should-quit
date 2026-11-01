// apps/server/vitest.config.ts
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

try { process.loadEnvFile('.env') } catch { /* 没有 .env 时用进程环境（CI） */ }

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup/reflect.ts'],
    globalSetup: ['test/setup/global.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789',
      INTERNAL_TOKEN: 'test-internal-token-0123456789abcdef01234',
      AUTH_MODE: 'mock',
      AGENT_ENGINE: 'fake',
      // 覆盖 .env 中的开发值，避免泄漏到测试 worker
      DSH_HOME_DIR: 'var/dsh-home-test',
      DEEPSEEK_API_KEY: '',
      WECHAT_APPID: '',
      WECHAT_SECRET: '',
    },
  },
})

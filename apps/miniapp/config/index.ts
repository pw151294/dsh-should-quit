import { defineConfig } from '@tarojs/cli'
export default defineConfig({
  projectName: 'should-quit', date: '2026-11-01', designWidth: 750,
  sourceRoot: 'src', outputRoot: 'dist', framework: 'react', compiler: 'webpack5',
  plugins: ['@tarojs/plugin-platform-weapp'],
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.API_BASE_URL ?? (process.env.NODE_ENV === 'production' ? 'https://api.example.com/api' : 'http://127.0.0.1:3000/api')),
    MOCK_LOGIN_CODE: JSON.stringify(process.env.NODE_ENV === 'production' ? '' : process.env.MOCK_LOGIN_CODE ?? ''),
  },
  mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } },
})

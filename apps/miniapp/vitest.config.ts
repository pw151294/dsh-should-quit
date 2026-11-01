import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' }, define: { API_BASE_URL: JSON.stringify('http://test/api'), MOCK_LOGIN_CODE: JSON.stringify('test-user') } })

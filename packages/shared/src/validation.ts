import { z } from 'zod'

// 小程序不支持动态 Function 编译，必须在创建 schema 前禁用 JIT。
z.config({ jitless: true })

export { z }

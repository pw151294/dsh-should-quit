// apps/server/src/main.ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { Server } from 'node:http'
import { InternalModule } from './internal/internal.module.js'
import { ErrorFilter } from './common/error.filter.js'
import { AppModule } from './app.module.js'
import { ENV, type Env } from './env.js'
import { coordinateShutdown } from './shutdown.js'
import { configureApp } from './setup.js'

async function bootstrap(): Promise<void> {
  const internal = await NestFactory.create(InternalModule, { logger: false, abortOnError: false })
  internal.useGlobalFilters(new ErrorFilter())
  await internal.listen(internal.get<Env>(ENV).INTERNAL_PORT, '127.0.0.1')
  try {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false })
  configureApp(app)
  const env = app.get<Env>(ENV)

  // 智能体单轮最长 300 秒（设计文档 §6.7）；Node 默认 requestTimeout 正好 300 秒，必须调大
  const server = app.getHttpServer() as Server
  server.requestTimeout = 330_000
  // 需满足 keepAliveTimeout < headersTimeout <= requestTimeout
  server.headersTimeout = 66_000
  server.keepAliveTimeout = 65_000

  coordinateShutdown(app, internal)
  await app.listen(env.PORT)
  } catch (error) { await internal.close(); throw error }
}

// 启动失败时打印错误并以非零码退出
bootstrap().catch(() => {
  console.error('服务启动失败，请检查配置与数据库连接')
  process.exit(1)
})

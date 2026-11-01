// apps/server/src/setup.ts
import type { INestApplication } from '@nestjs/common'
import { Logger } from 'nestjs-pino'
import { ErrorFilter } from './common/error.filter.js'

/** main.ts 与 e2e 测试共用的全局配置 */
export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger))
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new ErrorFilter())
}

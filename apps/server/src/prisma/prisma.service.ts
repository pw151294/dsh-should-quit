// apps/server/src/prisma/prisma.service.ts
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.js'
import { ENV, type Env } from '../env.js'
import { withUtcSession } from './connection-url.js'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    // 适配器直接接收 mysql:// 连接串（Task 2 已核实）
    super({ adapter: new PrismaMariaDb(withUtcSession(env.DATABASE_URL)) })
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}

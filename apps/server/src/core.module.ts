// apps/server/src/core.module.ts
import { Global, Module } from '@nestjs/common'
import { Clock, SystemClock } from './clock.js'
import { ENV, loadEnv } from './env.js'
import { PrismaService } from './prisma/prisma.service.js'
import { TIER_COPY, loadTierCopy } from './tiers/tier-copy.js'

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: Clock, useClass: SystemClock },
    { provide: TIER_COPY, useFactory: () => loadTierCopy() },
    PrismaService,
  ],
  exports: [ENV, Clock, TIER_COPY, PrismaService],
})
export class CoreModule {}

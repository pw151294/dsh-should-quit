// apps/server/src/score/score.module.ts
import { Module } from '@nestjs/common'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { ScoreController } from './score.controller.js'
import { ScoreService } from './score.service.js'

@Module({
  controllers: [ScoreController],
  providers: [ScoreService, BaselineRequiredGuard],
  exports: [ScoreService, BaselineRequiredGuard],
})
export class ScoreModule {}

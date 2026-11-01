// apps/server/src/baseline/baseline.module.ts
import { Module } from '@nestjs/common'
import { ScoreModule } from '../score/score.module.js'
import { BaselineController } from './baseline.controller.js'
import { BaselineService } from './baseline.service.js'

@Module({
  imports: [ScoreModule],
  controllers: [BaselineController],
  providers: [BaselineService],
})
export class BaselineModule {}

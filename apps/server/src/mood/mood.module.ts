// apps/server/src/mood/mood.module.ts
import { Module } from '@nestjs/common'
import { ScoreModule } from '../score/score.module.js'
import { MoodController } from './mood.controller.js'
import { MoodService } from './mood.service.js'

@Module({
  imports: [ScoreModule],
  controllers: [MoodController],
  providers: [MoodService],
  exports: [MoodService],
})
export class MoodModule {}

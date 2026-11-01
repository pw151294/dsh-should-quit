// apps/server/src/baseline/baseline.controller.ts
import { Body, Controller, Get, Put } from '@nestjs/common'
import { baselineSchema, type BaselineBody, type BaselineResponse, type ScoreView } from '@should-quit/shared'
import { UserId } from '../auth/decorators.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { BaselineService } from './baseline.service.js'

@Controller('baseline')
export class BaselineController {
  constructor(private readonly baseline: BaselineService) {}

  @Get()
  get(@UserId() userId: string): Promise<BaselineResponse> {
    return this.baseline.get(userId)
  }

  @Put()
  save(@UserId() userId: string, @Body(new ZodPipe(baselineSchema)) body: BaselineBody): Promise<ScoreView> {
    return this.baseline.save(userId, body)
  }
}

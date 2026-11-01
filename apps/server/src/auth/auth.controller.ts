// apps/server/src/auth/auth.controller.ts
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common'
import { loginSchema, type LoginResponse } from '@should-quit/shared'
import { AppError } from '../common/app-error.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { ENV, type Env } from '../env.js'
import { AuthService } from './auth.service.js'
import { Public } from './decorators.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(ENV) private readonly env: Env) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginSchema)) body: { code: string }): Promise<LoginResponse> {
    if (this.env.AUTH_MODE === 'mock' && body.code.length > 59) {
      throw new AppError('VALIDATION_FAILED', 'code: 过长')
    }
    return this.auth.login(body.code)
  }
}

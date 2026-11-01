// apps/server/src/auth/auth.module.ts
import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { ENV, type Env } from '../env.js'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
import { AuthService } from './auth.service.js'
import { HttpWechatClient, WechatClient } from './wechat.client.js'

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({ secret: env.JWT_SECRET, signOptions: { expiresIn: '7d' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: WechatClient, useClass: HttpWechatClient },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}

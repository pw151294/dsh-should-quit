// apps/server/src/app.module.ts
import { AgentModule } from './agent/agent.module.js'
import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { AuthModule } from './auth/auth.module.js'
import { BaselineModule } from './baseline/baseline.module.js'
import { CoreModule } from './core.module.js'
import { ENV, type Env } from './env.js'
import { MoodModule } from './mood/mood.module.js'
import { ScoreModule } from './score/score.module.js'

@Module({
  imports: [
    CoreModule,
    AgentModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : 'info',
          // 脱敏鉴权头；请求只记方法与路径，请求体不进日志
          redact: ['req.headers.authorization', 'req.headers["x-internal-token"]'],
          serializers: {
            req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
          },
        },
      }),
    }),
    AuthModule,
    ScoreModule,
    BaselineModule,
    MoodModule,
  ],
})
export class AppModule {}

// apps/server/src/common/zod.pipe.ts
import { Injectable, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { AppError } from './app-error.js'

/** 用 shared 的 zod schema 校验 @Body / @Query，失败抛 VALIDATION_FAILED */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value)
    if (r.success) return r.data
    const msg = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new AppError('VALIDATION_FAILED', msg)
  }
}

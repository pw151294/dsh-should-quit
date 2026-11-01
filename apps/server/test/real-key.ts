import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
export function realKey(source = process.env, path = '.env'): string {
  if (source.DEEPSEEK_API_KEY) return source.DEEPSEEK_API_KEY
  try { return parseEnv(readFileSync(path, 'utf8')).DEEPSEEK_API_KEY || '' }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

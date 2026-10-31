# Phase 2：monorepo 脚手架 + shared 包

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭好 pnpm monorepo，交付 `@should-quit/shared`：评分引擎、档位、基准题目、时区日期、错误码、zod DTO、UTF-8 增量解码器与 SSE 解析器，全部有单测。

**Architecture:** shared 是纯 TS、无 IO 的 ESM 包，`tsc` 编译到 `dist/`（target ES2019，小程序和 Node 都能直接用）。server 和 miniapp 只依赖编译产物，所以根脚本 `pnpm -r build` 按拓扑顺序先构建 shared。

**Tech Stack:** pnpm 12.16.1、TypeScript 5.9.3、zod 4.6.7、vitest 5.0.5。

**前置：** 读 `00-overview.md` 第 4 节“跨阶段契约”。本阶段导出的名称不得改动。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `package.json` / `pnpm-workspace.yaml` / `.npmrc` / `tsconfig.base.json` | monorepo 根配置 |
| `packages/shared/package.json` / `tsconfig.json` / `tsconfig.build.json` / `vitest.config.ts` | shared 包配置 |
| `packages/shared/src/time.ts` | `APP_TZ`、`localDate`、`daysBetween` |
| `packages/shared/src/scoring/objective.ts` | 基准字段、权重、客观分 |
| `packages/shared/src/scoring/mood.ts` | 星级映射、心情平时分 |
| `packages/shared/src/scoring/total.ts` | 综合分、档位、`computeScore` |
| `packages/shared/src/baseline-options.ts` | 8 道题目与 5 档选项 |
| `packages/shared/src/errors.ts` | 错误码与 HTTP 状态 |
| `packages/shared/src/dto.ts` | 请求 zod schema 与响应类型 |
| `packages/shared/src/stream/utf8.ts` | `Utf8StreamDecoder` |
| `packages/shared/src/stream/sse.ts` | `SseParser`、`formatSseFrame`、`SSE_PING` |
| `packages/shared/src/stream/agent-events.ts` | `formatAgentEvent`、`parseAgentEvent`（AgentEvent 与 SSE 帧互转） |
| `packages/shared/src/version.ts` | `ALGO_VERSION` |
| `packages/shared/src/index.ts` | 统一导出 |
| `packages/shared/test/*.test.ts` | 单测，一个源文件对应一个测试文件 |

---

### Task 1：monorepo 根配置

**Files:**
- Create: `package.json`、`pnpm-workspace.yaml`、`.npmrc`、`tsconfig.base.json`
- Modify: `.gitignore`

- [ ] **Step 1: 创建根 `package.json`**

```json
{
  "name": "should-quit",
  "private": true,
  "packageManager": "pnpm@12.16.1",
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "@types/node": "24.10.1"
  }
}
```

`@types/node` 用 `npm view @types/node@24 version` 查到的最新 24.x 替换。

- [ ] **Step 2: 创建 `pnpm-workspace.yaml` 与 `.npmrc`**

```yaml
# pnpm-workspace.yaml
packages:
  - packages/*
  - apps/*
```

```ini
# .npmrc
save-exact=true
```

`spike/` 不在 workspace 内，它有自己的 npm `node_modules`。

- [ ] **Step 3: 创建 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2019",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4: 更新 `.gitignore`**

追加（保留已有的 `.superpowers/` 与 `spike/` 条目）：

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
.env
apps/server/var/
```

- [ ] **Step 5: 安装并确认 workspace 可用**

Run: `pnpm install && pnpm -v`
Expected: 生成 `pnpm-lock.yaml`，输出 `12.16.1`。此时还没有子包，`pnpm -r test` 会提示 "No projects matched"，属正常。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc tsconfig.base.json pnpm-lock.yaml .gitignore
git commit -m "chore: scaffold pnpm monorepo"
```

---

### Task 2：shared 包骨架

**Files:**
- Create: `packages/shared/package.json`、`tsconfig.json`、`tsconfig.build.json`、`vitest.config.ts`、`src/index.ts`

**约定（本包所有源文件都遵守）：**
- 相对导入一律写 `.js` 后缀（如 `import { x } from './time.js'`）。编译产物直接给 Node ESM 加载，Node 不会自动补扩展名；vitest 会把 `.js` 解析回 `.ts`。
- `src/` 不得使用任何 Node 或 DOM API（`Buffer`、`TextDecoder`、`Intl` 时区等），因为同一份产物要在小程序里运行。`tsconfig.build.json` 用 `types: []` 和 `lib: ["ES2019"]` 在编译期拦住。

- [ ] **Step 1: 创建 `packages/shared/package.json`**

```json
{
  "name": "@should-quit/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "4.6.7"
  },
  "devDependencies": {
    "vitest": "5.0.5"
  }
}
```

- [ ] **Step 2: 创建两份 tsconfig**

```json
// packages/shared/tsconfig.json —— 类型检查，含测试
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"], "noEmit": true },
  "include": ["src", "test", "vitest.config.ts"]
}
```

```json
// packages/shared/tsconfig.build.json —— 产物，禁止 Node/DOM API
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "lib": ["ES2019"],
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `vitest.config.ts` 与占位入口**

```ts
// packages/shared/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})
```

```ts
// packages/shared/src/index.ts —— 后续 Task 逐个补充导出
export {}
```

- [ ] **Step 4: 安装并确认构建链路**

Run: `pnpm install && pnpm --filter @should-quit/shared build && ls packages/shared/dist`
Expected: 生成 `index.js`、`index.d.ts`。

- [ ] **Step 5: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "chore(shared): scaffold shared package"
```

---

### Task 3：时区日期工具

**Files:**
- Create: `packages/shared/src/time.ts`
- Test: `packages/shared/test/time.test.ts`

Asia/Shanghai 自 1991 年起固定 UTC+8，没有夏令时，所以 `localDate` 直接加 8 小时再取 UTC 日期，不依赖 `Intl`（部分小程序基础库的 `Intl` 时区数据不完整）。`daysBetween` 只处理 `YYYY-MM-DD` 字符串，按 UTC 零点相减，不受运行环境时区影响。

- [ ] **Step 1: 写失败测试 `packages/shared/test/time.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { APP_TZ, daysBetween, localDate, shiftDate } from '../src/time.js'

describe('localDate', () => {
  it('APP_TZ 固定为 Asia/Shanghai', () => {
    expect(APP_TZ).toBe('Asia/Shanghai')
  })
  it('北京时间 23:59 与次日 00:01 归入不同的两天', () => {
    // 2026-10-31 23:59 北京时间 = 2026-10-31T15:59Z
    expect(localDate(new Date('2026-10-31T15:59:00Z'))).toBe('2026-10-31')
    // 2026-11-01 00:01 北京时间 = 2026-10-31T16:01Z
    expect(localDate(new Date('2026-10-31T16:01:00Z'))).toBe('2026-11-01')
  })
  it('跨年', () => {
    expect(localDate(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
  })
})

describe('daysBetween', () => {
  it('同一天为 0，次日为 1', () => {
    expect(daysBetween('2026-10-31', '2026-10-31')).toBe(0)
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
  })
  it('跨月、跨闰年 2 月', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })
  it('from 晚于 to 时为负数', () => {
    expect(daysBetween('2026-11-01', '2026-10-31')).toBe(-1)
  })
  it('非法格式抛错', () => {
    expect(() => daysBetween('2026/10/31', '2026-10-31')).toThrow()
  })
})

describe('shiftDate', () => {
  it('向前 29 天', () => {
    expect(shiftDate('2026-10-31', -29)).toBe('2026-10-02')
  })
  it('跨月向后', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01')
  })
})
```

`shiftDate` 是契约外新增的辅助函数，server 算 30 天窗口起点、趋势 `before` 查询时要用。已同步补进总览第 4 节。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- time`
Expected: FAIL，`Cannot find module '../src/time.js'` 或导出不存在。

- [ ] **Step 3: 实现 `packages/shared/src/time.ts`**

```ts
// packages/shared/src/time.ts
export const APP_TZ = 'Asia/Shanghai'

/** Asia/Shanghai 固定 UTC+8，无夏令时 */
const OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function formatUtcDate(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 把 'YYYY-MM-DD' 解析为该日 UTC 零点的毫秒数；格式或日期非法时抛错 */
function parseDate(s: string): number {
  const m = DATE_RE.exec(s)
  if (!m) throw new Error(`invalid date: ${s}`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const ms = Date.UTC(y, mo - 1, d)
  // 拦住 2026-02-30 这类会被 Date.UTC 静默进位的日期
  if (formatUtcDate(new Date(ms)) !== s) throw new Error(`invalid date: ${s}`)
  return ms
}

/** 某个时刻在 Asia/Shanghai 的本地日期，格式 'YYYY-MM-DD' */
export function localDate(at: Date): string {
  return formatUtcDate(new Date(at.getTime() + OFFSET_MS))
}

/** to − from 的自然日差 */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS)
}

/** 日期加减 n 天 */
export function shiftDate(date: string, days: number): string {
  return formatUtcDate(new Date(parseDate(date) + days * DAY_MS))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- time`
Expected: PASS，9 个用例全部通过。

- [ ] **Step 5: 导出并提交**

在 `packages/shared/src/index.ts` 中把 `export {}` 替换为：

```ts
export * from './time.js'
```

```bash
git add packages/shared/src/time.ts packages/shared/src/index.ts packages/shared/test/time.test.ts
git commit -m "feat(shared): add Asia/Shanghai date helpers"
```

---

### Task 4：客观基准分

**Files:**
- Create: `packages/shared/src/scoring/objective.ts`
- Test: `packages/shared/test/objective.test.ts`

单项分 = (等级 − 1) × 25；客观分 = Σ(单项分 × 权重) / 100，保留两位小数。权重合计必须为 100，用测试锁住，防止以后改权重时漏改。

- [ ] **Step 1: 写失败测试 `packages/shared/test/objective.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  BASELINE_FIELDS, BASELINE_WEIGHTS, levelToScore, objectiveScore, type BaselineInput,
} from '../src/scoring/objective.js'

const all = (level: 1 | 2 | 3 | 4 | 5): BaselineInput =>
  Object.fromEntries(BASELINE_FIELDS.map((f) => [f, level])) as BaselineInput

describe('objectiveScore', () => {
  it('8 个字段，权重合计 100', () => {
    expect(BASELINE_FIELDS).toHaveLength(8)
    expect(BASELINE_FIELDS.reduce((s, f) => s + BASELINE_WEIGHTS[f], 0)).toBe(100)
  })
  it('等级映射 0/25/50/75/100', () => {
    expect([1, 2, 3, 4, 5].map(levelToScore)).toEqual([0, 25, 50, 75, 100])
  })
  it('全 1 → 0，全 5 → 100，全 3 → 50', () => {
    expect(objectiveScore(all(1)).score).toBe(0)
    expect(objectiveScore(all(5)).score).toBe(100)
    expect(objectiveScore(all(3)).score).toBe(50)
  })
  it('只有薪资为 5、其余为 1 → 20（薪资权重 20）', () => {
    const r = objectiveScore({ ...all(1), salary: 5 })
    expect(r.score).toBe(20)
    expect(r.breakdown.salary).toBe(100)
    expect(r.breakdown.commute).toBe(0)
  })
  it('通勤为 2、其余为 1 → 2.5（保留小数）', () => {
    expect(objectiveScore({ ...all(1), commute: 2 }).score).toBe(2.5)
  })
  it('等级越界或缺项时抛错', () => {
    expect(() => objectiveScore({ ...all(3), salary: 6 } as unknown as BaselineInput)).toThrow()
    const { growth: _g, ...missing } = all(3)
    expect(() => objectiveScore(missing as unknown as BaselineInput)).toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- objective`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/scoring/objective.ts`**

```ts
// packages/shared/src/scoring/objective.ts
export const BASELINE_FIELDS = [
  'salary', 'overtime', 'growth', 'workload', 'contentFit', 'commute', 'restTime', 'stabilityBenefits',
] as const
export type BaselineField = typeof BASELINE_FIELDS[number]
export type Level = 1 | 2 | 3 | 4 | 5
export type BaselineInput = Record<BaselineField, Level>

/** 项权重，合计 100。改动时同步提升 ALGO_VERSION */
export const BASELINE_WEIGHTS: Record<BaselineField, number> = {
  salary: 20,
  overtime: 15,
  growth: 15,
  workload: 12,
  contentFit: 12,
  commute: 10,
  restTime: 8,
  stabilityBenefits: 8,
}

function assertLevel(field: string, v: unknown): asserts v is Level {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
    throw new Error(`invalid level for ${field}: ${String(v)}`)
  }
}

export function levelToScore(level: number): number {
  assertLevel('level', level)
  return (level - 1) * 25
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function objectiveScore(b: BaselineInput): { score: number; breakdown: Record<BaselineField, number> } {
  const breakdown = {} as Record<BaselineField, number>
  let sum = 0
  for (const f of BASELINE_FIELDS) {
    const level = (b as Record<string, unknown>)[f]
    assertLevel(f, level)
    const s = levelToScore(level)
    breakdown[f] = s
    sum += s * BASELINE_WEIGHTS[f]
  }
  return { score: round2(sum / 100), breakdown }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- objective`
Expected: PASS，6 个用例全部通过。

- [ ] **Step 5: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './scoring/objective.js'
```

```bash
git add packages/shared/src/scoring/objective.ts packages/shared/src/index.ts packages/shared/test/objective.test.ts
git commit -m "feat(shared): add objective baseline scoring"
```

---

### Task 5：心情平时分

**Files:**
- Create: `packages/shared/src/scoring/mood.ts`
- Test: `packages/shared/test/mood.test.ts`

输入是“每天的日均分 + 距今天数”，由调用方（server）先按本地日期 GROUP BY 算好。这里只负责窗口过滤和衰减加权，保持纯函数。

- [ ] **Step 1: 写失败测试 `packages/shared/test/mood.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { MOOD_HALF_LIFE_DAYS, MOOD_WINDOW_DAYS, dailyAverage, moodScore, starsToScore } from '../src/scoring/mood.js'

describe('starsToScore', () => {
  it('1–5 星映射 0/25/50/75/100', () => {
    expect([1, 2, 3, 4, 5].map(starsToScore)).toEqual([0, 25, 50, 75, 100])
  })
  it('越界抛错', () => {
    expect(() => starsToScore(0)).toThrow()
    expect(() => starsToScore(3.5)).toThrow()
  })
})

describe('dailyAverage', () => {
  it('当天多次打卡取均值，保留两位小数', () => {
    expect(dailyAverage([1, 2, 2])).toBe(16.67) // (0+25+25)/3
  })
  it('空数组抛错', () => {
    expect(() => dailyAverage([])).toThrow()
  })
})

describe('moodScore', () => {
  it('常量：窗口 30 天、半衰期 7 天', () => {
    expect(MOOD_WINDOW_DAYS).toBe(30)
    expect(MOOD_HALF_LIFE_DAYS).toBe(7)
  })
  it('无数据为 null', () => {
    expect(moodScore([])).toBeNull()
  })
  it('只有一天时等于该日均分', () => {
    expect(moodScore([{ age: 3, avg: 40 }])).toBe(40)
  })
  it('距今 29 天计入，30 天不计入', () => {
    expect(moodScore([{ age: 29, avg: 80 }])).toBe(80)
    expect(moodScore([{ age: 30, avg: 80 }])).toBeNull()
    expect(moodScore([{ age: 0, avg: 0 }, { age: 30, avg: 100 }])).toBe(0)
  })
  it('衰减权重：今天 100、7 天前 0 → 权重 1:0.5 → 66.67', () => {
    expect(moodScore([{ age: 0, avg: 100 }, { age: 7, avg: 0 }])).toBe(66.67)
  })
  it('一个月前低落、最近一周好转时，分数明显高于简单平均', () => {
    const daily = [
      ...[20, 21, 22, 23, 24, 25, 26].map((age) => ({ age, avg: 0 })),
      ...[0, 1, 2, 3, 4, 5, 6].map((age) => ({ age, avg: 100 })),
    ]
    const s = moodScore(daily)!
    expect(s).toBeGreaterThan(80) // 简单平均为 50
  })
  it('负数 age（未来日期）抛错', () => {
    expect(() => moodScore([{ age: -1, avg: 50 }])).toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- mood`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/scoring/mood.ts`**

```ts
// packages/shared/src/scoring/mood.ts
import { round2 } from './objective.js'

export const MOOD_WINDOW_DAYS = 30
export const MOOD_HALF_LIFE_DAYS = 7

export interface DailyMood {
  /** 距今天数，今天为 0 */
  age: number
  /** 当日均分 0–100 */
  avg: number
}

export function starsToScore(stars: number): number {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error(`invalid stars: ${stars}`)
  return ((stars - 1) / 4) * 100
}

/** 当天所有打卡星级 → 日均分 */
export function dailyAverage(stars: number[]): number {
  if (stars.length === 0) throw new Error('dailyAverage: empty')
  const sum = stars.reduce((acc, s) => acc + starsToScore(s), 0)
  return round2(sum / stars.length)
}

/** 近 30 天指数衰减加权平均；窗口内无数据返回 null */
export function moodScore(daily: DailyMood[]): number | null {
  let wSum = 0
  let sum = 0
  for (const { age, avg } of daily) {
    if (!Number.isInteger(age) || age < 0) throw new Error(`invalid age: ${age}`)
    if (age >= MOOD_WINDOW_DAYS) continue
    const w = Math.pow(0.5, age / MOOD_HALF_LIFE_DAYS)
    wSum += w
    sum += w * avg
  }
  return wSum === 0 ? null : round2(sum / wSum)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- mood`
Expected: PASS，10 个用例全部通过。

- [ ] **Step 5: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './scoring/mood.js'
```

```bash
git add packages/shared/src/scoring/mood.ts packages/shared/src/index.ts packages/shared/test/mood.test.ts
git commit -m "feat(shared): add decayed mood score"
```

---

### Task 6：综合分、档位与 `computeScore`

**Files:**
- Create: `packages/shared/src/scoring/total.ts`
- Test: `packages/shared/test/total.test.ts`

档位边界属于算法，和权重一起由 `ALGO_VERSION` 管理。文案不在这里，在 server 的 `config/tiers.json`。

- [ ] **Step 1: 写失败测试 `packages/shared/test/total.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { ALGO_VERSION, OBJECTIVE_WEIGHT, MOOD_WEIGHT, TIERS, computeScore, tierOf, totalScore } from '../src/scoring/total.js'
import type { BaselineInput } from '../src/scoring/objective.js'

const all = (l: 1 | 2 | 3 | 4 | 5): BaselineInput => ({
  salary: l, overtime: l, growth: l, workload: l, contentFit: l, commute: l, restTime: l, stabilityBenefits: l,
})

describe('totalScore', () => {
  it('权重 0.6 / 0.4，算法版本为 1', () => {
    expect(OBJECTIVE_WEIGHT).toBe(0.6)
    expect(MOOD_WEIGHT).toBe(0.4)
    expect(ALGO_VERSION).toBe(1)
  })
  it('有心情分时加权并四舍五入', () => {
    expect(totalScore(52, 39)).toBe(47) // 31.2 + 15.6 = 46.8
  })
  it('心情分为 null 时等于客观分取整', () => {
    expect(totalScore(52.5, null)).toBe(53)
  })
})

describe('tierOf', () => {
  it.each([
    [0, 'RUN'], [20, 'RUN'], [21, 'SEEK'], [60, 'SEEK'],
    [61, 'WATCH'], [80, 'WATCH'], [81, 'STAY'], [100, 'STAY'],
  ] as const)('%i → %s', (score, tier) => {
    expect(tierOf(score)).toBe(tier)
  })
  it('非整数或越界抛错', () => {
    expect(() => tierOf(20.5)).toThrow()
    expect(() => tierOf(-1)).toThrow()
    expect(() => tierOf(101)).toThrow()
  })
  it('四档按顺序覆盖 0–100 无空隙', () => {
    expect(TIERS.map((t) => [t.min, t.max])).toEqual([[0, 20], [21, 60], [61, 80], [81, 100]])
  })
})

describe('四舍五入后再判档', () => {
  it('20.4 → RUN，20.5 → SEEK', () => {
    expect(tierOf(totalScore(20.4, null))).toBe('RUN')
    expect(tierOf(totalScore(20.5, null))).toBe('SEEK')
  })
})

describe('computeScore', () => {
  it('无打卡：mood 为 null，total 等于客观分', () => {
    const r = computeScore(all(3), [])
    expect(r).toMatchObject({ objectiveScore: 50, moodScore: null, totalScore: 50, tier: 'SEEK', algoVersion: 1 })
    expect(r.breakdown.salary).toBe(50)
  })
  it('全满分 + 心情满分 → 100 / STAY', () => {
    expect(computeScore(all(5), [{ age: 0, avg: 100 }])).toMatchObject({ totalScore: 100, tier: 'STAY' })
  })
  it('全最差 + 心情最差 → 0 / RUN', () => {
    expect(computeScore(all(1), [{ age: 0, avg: 0 }])).toMatchObject({ totalScore: 0, tier: 'RUN' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- total`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/scoring/total.ts`**

```ts
// packages/shared/src/scoring/total.ts
import { objectiveScore, type BaselineField, type BaselineInput } from './objective.js'
import { moodScore, type DailyMood } from './mood.js'

export const ALGO_VERSION = 1
export const OBJECTIVE_WEIGHT = 0.6
export const MOOD_WEIGHT = 0.4

export type Tier = 'RUN' | 'SEEK' | 'WATCH' | 'STAY'

/** 闭区间，按分数升序 */
export const TIERS: ReadonlyArray<{ tier: Tier; min: number; max: number }> = [
  { tier: 'RUN', min: 0, max: 20 },
  { tier: 'SEEK', min: 21, max: 60 },
  { tier: 'WATCH', min: 61, max: 80 },
  { tier: 'STAY', min: 81, max: 100 },
]

export interface ScoreResult {
  objectiveScore: number
  moodScore: number | null
  totalScore: number
  tier: Tier
  breakdown: Record<BaselineField, number>
  algoVersion: number
}

/** 返回四舍五入后的整数 */
export function totalScore(objective: number, mood: number | null): number {
  const raw = mood === null ? objective : objective * OBJECTIVE_WEIGHT + mood * MOOD_WEIGHT
  // 先修正浮点误差（如 46.8 存成 46.79999），再取整
  return Math.round(Math.round(raw * 1e6) / 1e6)
}

export function tierOf(total: number): Tier {
  if (!Number.isInteger(total) || total < 0 || total > 100) throw new Error(`invalid total: ${total}`)
  const hit = TIERS.find((t) => total >= t.min && total <= t.max)
  if (!hit) throw new Error(`no tier for ${total}`)
  return hit.tier
}

export function computeScore(b: BaselineInput, daily: DailyMood[]): ScoreResult {
  const obj = objectiveScore(b)
  const mood = moodScore(daily)
  const total = totalScore(obj.score, mood)
  return {
    objectiveScore: obj.score,
    moodScore: mood,
    totalScore: total,
    tier: tierOf(total),
    breakdown: obj.breakdown,
    algoVersion: ALGO_VERSION,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- total`
Expected: PASS，16 个用例全部通过（`it.each` 展开 8 个）。

- [ ] **Step 5: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './scoring/total.js'
```

```bash
git add packages/shared/src/scoring/total.ts packages/shared/src/index.ts packages/shared/test/total.test.ts
git commit -m "feat(shared): add total score, tiers and computeScore"
```

---

### Task 7：基准题目与选项

**Files:**
- Create: `packages/shared/src/baseline-options.ts`
- Test: `packages/shared/test/baseline-options.test.ts`

每道题 5 个选项，按**界面展示顺序**排列，每个选项带 `level`（1 最差、5 最好）。展示顺序和优劣等级解耦：通勤、加班这类“越多越差”的题，第一个选项是 level 5。录入页按数组顺序渲染，提交时只传 `level`。

- [ ] **Step 1: 写失败测试 `packages/shared/test/baseline-options.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { BASELINE_OPTIONS, optionLabel } from '../src/baseline-options.js'
import { BASELINE_FIELDS } from '../src/scoring/objective.js'

describe('BASELINE_OPTIONS', () => {
  it('覆盖全部 8 个字段，顺序与 BASELINE_FIELDS 一致', () => {
    expect(BASELINE_OPTIONS.map((q) => q.field)).toEqual([...BASELINE_FIELDS])
  })
  it('每题 5 个选项，level 恰好是 1–5 各一个', () => {
    for (const q of BASELINE_OPTIONS) {
      expect(q.options).toHaveLength(5)
      expect([...q.options.map((o) => o.level)].sort()).toEqual([1, 2, 3, 4, 5])
    }
  })
  it('题目与选项文案非空', () => {
    for (const q of BASELINE_OPTIONS) {
      expect(q.title.length).toBeGreaterThan(0)
      for (const o of q.options) expect(o.label.length).toBeGreaterThan(0)
    }
  })
  it('通勤：<30 分钟为 5，>120 分钟为 1', () => {
    expect(optionLabel('commute', 5)).toBe('30 分钟以内')
    expect(optionLabel('commute', 1)).toBe('2 小时以上')
  })
  it('加班：从不为 5，天天为 1', () => {
    expect(optionLabel('overtime', 5)).toBe('从不加班')
    expect(optionLabel('overtime', 1)).toBe('天天加班')
  })
  it('非法 level 抛错', () => {
    expect(() => optionLabel('salary', 6)).toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- baseline-options`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/baseline-options.ts`**

```ts
// packages/shared/src/baseline-options.ts
// Level 定义在 objective.ts，这里只引用；重复导出会让 index.ts 的两个 `export *` 报 TS2308
import type { BaselineField, Level } from './scoring/objective.js'

export interface BaselineQuestion {
  field: BaselineField
  title: string
  hint: string
  /** 界面展示顺序；level 表示优劣，1 最差 5 最好 */
  options: ReadonlyArray<{ level: Level; label: string }>
}

export const BASELINE_OPTIONS: ReadonlyArray<BaselineQuestion> = [
  {
    field: 'salary', title: '对现在的薪资满意吗？', hint: '结合行业水平和你的期望',
    options: [
      { level: 1, label: '远低于预期' }, { level: 2, label: '偏低' }, { level: 3, label: '一般' },
      { level: 4, label: '比较满意' }, { level: 5, label: '非常满意' },
    ],
  },
  {
    field: 'overtime', title: '平时加班多吗？', hint: '按最近 3 个月的常态选',
    options: [
      { level: 5, label: '从不加班' }, { level: 4, label: '偶尔加班' }, { level: 3, label: '每周 1–2 天' },
      { level: 2, label: '每周 3–4 天' }, { level: 1, label: '天天加班' },
    ],
  },
  {
    field: 'growth', title: '晋升和成长空间怎么样？', hint: '能学到东西、有上升通道吗',
    options: [
      { level: 1, label: '完全看不到' }, { level: 2, label: '很有限' }, { level: 3, label: '一般' },
      { level: 4, label: '比较好' }, { level: 5, label: '非常好' },
    ],
  },
  {
    field: 'workload', title: '工作强度和压力大吗？', hint: '身心两方面综合感受',
    options: [
      { level: 5, label: '很轻松' }, { level: 4, label: '略有压力' }, { level: 3, label: '适中' },
      { level: 2, label: '压力较大' }, { level: 1, label: '快扛不住了' },
    ],
  },
  {
    field: 'contentFit', title: '工作内容适合你吗？', hint: '擅长、喜欢、有意义',
    options: [
      { level: 1, label: '完全不适合' }, { level: 2, label: '不太适合' }, { level: 3, label: '还行' },
      { level: 4, label: '比较适合' }, { level: 5, label: '非常适合' },
    ],
  },
  {
    field: 'commute', title: '每天通勤多久？', hint: '单程时间',
    options: [
      { level: 5, label: '30 分钟以内' }, { level: 4, label: '30–60 分钟' }, { level: 3, label: '1–1.5 小时' },
      { level: 2, label: '1.5–2 小时' }, { level: 1, label: '2 小时以上' },
    ],
  },
  {
    field: 'restTime', title: '每周能陪家人或自由休息多久？', hint: '真正属于自己的时间',
    options: [
      { level: 1, label: '几乎没有' }, { level: 2, label: '不到 1 天' }, { level: 3, label: '1 天左右' },
      { level: 4, label: '1.5 天左右' }, { level: 5, label: '完整双休' },
    ],
  },
  {
    field: 'stabilityBenefits', title: '工作稳定性和福利如何？', hint: '五险一金、裁员风险、假期等',
    options: [
      { level: 1, label: '很差' }, { level: 2, label: '偏差' }, { level: 3, label: '一般' },
      { level: 4, label: '较好' }, { level: 5, label: '很好' },
    ],
  },
]

export function optionLabel(field: BaselineField, level: number): string {
  const q = BASELINE_OPTIONS.find((x) => x.field === field)
  const o = q?.options.find((x) => x.level === level)
  if (!o) throw new Error(`invalid option: ${field}=${level}`)
  return o.label
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- baseline-options`
Expected: PASS，6 个用例全部通过。

- [ ] **Step 5: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './baseline-options.js'
```

```bash
git add packages/shared/src/baseline-options.ts packages/shared/src/index.ts packages/shared/test/baseline-options.test.ts
git commit -m "feat(shared): add baseline questions and options"
```

---

### Task 8：错误码与 HTTP 状态

**Files:**
- Create: `packages/shared/src/errors.ts`
- Test: `packages/shared/test/errors.test.ts`

错误码与设计文档 §5 对照表一一对应。`AGENT_UNAVAILABLE`、`AGENT_TIMEOUT` 只出现在 SSE `error` 事件里，HTTP 状态记为 `null`。

- [ ] **Step 1: 写失败测试 `packages/shared/test/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { ErrorCode, errorHttpStatus, isErrorBody } from '../src/errors.js'

describe('errors', () => {
  it('包含设计文档 §5 的全部 11 个错误码', () => {
    expect(Object.keys(ErrorCode).sort()).toEqual([
      'AGENT_BUSY', 'AGENT_RESTARTING', 'AGENT_TIMEOUT', 'AGENT_UNAVAILABLE', 'BASELINE_REQUIRED',
      'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'UNAUTHORIZED', 'VALIDATION_FAILED', 'WECHAT_LOGIN_FAILED',
    ])
  })
  it('键与值相同', () => {
    for (const [k, v] of Object.entries(ErrorCode)) expect(v).toBe(k)
  })
  it('HTTP 状态对照', () => {
    expect(errorHttpStatus.VALIDATION_FAILED).toBe(400)
    expect(errorHttpStatus.UNAUTHORIZED).toBe(401)
    expect(errorHttpStatus.WECHAT_LOGIN_FAILED).toBe(401)
    expect(errorHttpStatus.FORBIDDEN).toBe(403)
    expect(errorHttpStatus.NOT_FOUND).toBe(404)
    expect(errorHttpStatus.BASELINE_REQUIRED).toBe(409)
    expect(errorHttpStatus.AGENT_BUSY).toBe(409)
    expect(errorHttpStatus.RATE_LIMITED).toBe(429)
    expect(errorHttpStatus.AGENT_RESTARTING).toBe(503)
    expect(errorHttpStatus.AGENT_UNAVAILABLE).toBeNull()
    expect(errorHttpStatus.AGENT_TIMEOUT).toBeNull()
  })
  it('isErrorBody 识别 {code, message}', () => {
    expect(isErrorBody({ code: 'NOT_FOUND', message: 'x' })).toBe(true)
    expect(isErrorBody({ code: 'WHATEVER', message: 'x' })).toBe(false)
    expect(isErrorBody({ code: 'NOT_FOUND' })).toBe(false)
    expect(isErrorBody(null)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- errors`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/errors.ts`**

```ts
// packages/shared/src/errors.ts
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  WECHAT_LOGIN_FAILED: 'WECHAT_LOGIN_FAILED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BASELINE_REQUIRED: 'BASELINE_REQUIRED',
  AGENT_BUSY: 'AGENT_BUSY',
  RATE_LIMITED: 'RATE_LIMITED',
  AGENT_RESTARTING: 'AGENT_RESTARTING',
  AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/** null 表示只通过 SSE error 事件下发，不作为 HTTP 响应 */
export const errorHttpStatus: Record<ErrorCode, number | null> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  WECHAT_LOGIN_FAILED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BASELINE_REQUIRED: 409,
  AGENT_BUSY: 409,
  RATE_LIMITED: 429,
  AGENT_RESTARTING: 503,
  AGENT_UNAVAILABLE: null,
  AGENT_TIMEOUT: null,
}

export interface ErrorBody {
  code: ErrorCode
  message: string
}

export function isErrorBody(v: unknown): v is ErrorBody {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.code === 'string'
    && Object.prototype.hasOwnProperty.call(ErrorCode, o.code)
    && typeof o.message === 'string'
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- errors`
Expected: PASS，4 个用例全部通过。

- [ ] **Step 5: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './errors.js'
```

```bash
git add packages/shared/src/errors.ts packages/shared/src/index.ts packages/shared/test/errors.test.ts
git commit -m "feat(shared): add error codes and http status map"
```

---

### Task 9：请求 schema 与响应类型

**Files:**
- Create: `packages/shared/src/dto.ts`
- Test: `packages/shared/test/dto.test.ts`

请求体和查询参数的 zod schema 前后端共用：server 用它校验，小程序用它在提交前做同样的校验。响应只导出 TS 类型，不做运行时校验。

- [ ] **Step 1: 写失败测试 `packages/shared/test/dto.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  askSchema, baselineSchema, dailyQuerySchema, loginSchema, moodCreateSchema, moodDateQuerySchema, trendQuerySchema,
} from '../src/dto.js'

const fullBaseline = {
  salary: 3, overtime: 3, growth: 3, workload: 3, contentFit: 3, commute: 3, restTime: 3, stabilityBenefits: 3,
}

describe('baselineSchema', () => {
  it('8 项 1–5 整数通过', () => {
    expect(baselineSchema.parse(fullBaseline)).toEqual(fullBaseline)
  })
  it('缺项、越界、小数、多余字段都拒绝', () => {
    const { salary: _s, ...missing } = fullBaseline
    expect(baselineSchema.safeParse(missing).success).toBe(false)
    expect(baselineSchema.safeParse({ ...fullBaseline, salary: 6 }).success).toBe(false)
    expect(baselineSchema.safeParse({ ...fullBaseline, salary: 2.5 }).success).toBe(false)
    expect(baselineSchema.safeParse({ ...fullBaseline, extra: 1 }).success).toBe(false)
  })
})

describe('moodCreateSchema', () => {
  it('星级 1–5；备注可选，去首尾空白，空串视为未填', () => {
    expect(moodCreateSchema.parse({ stars: 4 })).toEqual({ stars: 4 })
    expect(moodCreateSchema.parse({ stars: 4, note: '  累  ' })).toEqual({ stars: 4, note: '累' })
    expect(moodCreateSchema.parse({ stars: 4, note: '   ' })).toEqual({ stars: 4 })
  })
  it('备注超过 200 字拒绝，星级越界拒绝', () => {
    expect(moodCreateSchema.safeParse({ stars: 4, note: '字'.repeat(201) }).success).toBe(false)
    expect(moodCreateSchema.safeParse({ stars: 0 }).success).toBe(false)
  })
})

describe('查询参数', () => {
  it('days 从字符串转数字，默认 30，范围 1–90', () => {
    expect(dailyQuerySchema.parse({})).toEqual({ days: 30 })
    expect(dailyQuerySchema.parse({ days: '7' })).toEqual({ days: 7 })
    expect(dailyQuerySchema.safeParse({ days: '91' }).success).toBe(false)
  })
  it('range 只接受 7d/30d/90d，默认 30d', () => {
    expect(trendQuerySchema.parse({})).toEqual({ range: '30d' })
    expect(trendQuerySchema.safeParse({ range: '1y' }).success).toBe(false)
  })
  it('date 必须是合法的 YYYY-MM-DD', () => {
    expect(moodDateQuerySchema.parse({ date: '2026-10-31' })).toEqual({ date: '2026-10-31' })
    expect(moodDateQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false)
  })
})

describe('askSchema / loginSchema', () => {
  it('提问 1–500 字，去首尾空白后不能为空', () => {
    expect(askSchema.parse({ text: ' 我该溜吗 ' })).toEqual({ text: '我该溜吗' })
    expect(askSchema.safeParse({ text: '   ' }).success).toBe(false)
    expect(askSchema.safeParse({ text: '字'.repeat(501) }).success).toBe(false)
  })
  it('登录 code 非空且不超过 128 字符', () => {
    expect(loginSchema.safeParse({ code: '' }).success).toBe(false)
    expect(loginSchema.parse({ code: 'abc' })).toEqual({ code: 'abc' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- dto`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/dto.ts` 的请求 schema**

zod 4 写法：`z.strictObject` 拒绝多余字段，`z.coerce.number()` 把查询字符串转成数字。

```ts
// packages/shared/src/dto.ts
import { z } from 'zod'
import { BASELINE_FIELDS, type BaselineField } from './scoring/objective.js'
import { shiftDate } from './time.js'

const level = z.number().int().min(1).max(5)

export const baselineSchema = z.strictObject(
  Object.fromEntries(BASELINE_FIELDS.map((f) => [f, level])) as Record<BaselineField, typeof level>,
)

export const moodCreateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
})

export const dailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
})

export const trendQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
})
export type TrendRange = z.infer<typeof trendQuerySchema>['range']
export const TREND_RANGE_DAYS: Record<TrendRange, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** 合法的 YYYY-MM-DD；shiftDate(d, 0) 会对格式错误或 02-30 这类日期抛错 */
export const dateString = z.string().refine((d) => {
  try {
    return shiftDate(d, 0) === d
  } catch {
    return false
  }
}, 'invalid date')

export const moodDateQuerySchema = z.object({ date: dateString })

export const askSchema = z.object({ text: z.string().trim().min(1).max(500) })

export const loginSchema = z.object({ code: z.string().min(1).max(128) })

export type BaselineBody = z.infer<typeof baselineSchema>
export type MoodCreateBody = z.infer<typeof moodCreateSchema>
export type AskBody = z.infer<typeof askSchema>
```

- [ ] **Step 4: 在 `dto.ts` 末尾追加响应类型**

只有类型，没有运行时代码。日期统一为 `'YYYY-MM-DD'` 字符串，时间戳为 ISO 字符串。

```ts
// ---- 响应类型（packages/shared/src/dto.ts 续） ----
import type { ScoreResult, Tier } from './scoring/total.js'
import type { ErrorCode } from './errors.js'

export interface TierCopy { label: string; slogan: string; guidance: string }

/** GET /api/score/current，以及 PUT /api/baseline、POST /api/moods 的返回 */
export interface ScoreView extends ScoreResult { copy: TierCopy }

export interface UserView { id: string; nickname: string | null; avatarUrl: string | null }
export interface LoginResponse { token: string; user: UserView; hasBaseline: boolean }

export interface MoodDailyItem { date: string; avg: number; count: number }
export interface MoodItem { id: string; stars: number; note: string | null; createdAt: string }

export interface TrendPoint { date: string; totalScore: number; tier: Tier; objectiveScore: number; moodScore: number | null }
export interface TrendResponse { before: TrendPoint | null; items: TrendPoint[] }

export interface ConversationView { id: string; title: string | null; createdAt: string; lastMessageAt: string }
export type MessageRole = 'USER' | 'ASSISTANT'
export type MessageStatus = 'COMPLETE' | 'FAILED' | 'INTERRUPTED'
export interface MessageView { id: string; role: MessageRole; content: string; status: MessageStatus; createdAt: string }
export interface AgentConfigView { presetQuestions: string[] }

/** SSE 事件负载（event 名即 type） */
export type AgentEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; label: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; code: ErrorCode; message: string }
```

`import type` 写在文件中部在 TS 里合法，但为了可读性，执行时把这两行挪到文件顶部的 import 区。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- dto && pnpm --filter @should-quit/shared typecheck`
Expected: PASS，9 个用例全部通过；类型检查无报错。

- [ ] **Step 6: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './dto.js'
```

```bash
git add packages/shared/src/dto.ts packages/shared/src/index.ts packages/shared/test/dto.test.ts
git commit -m "feat(shared): add request schemas and response types"
```

---

### Task 10：UTF-8 增量解码器

**Files:**
- Create: `packages/shared/src/stream/utf8.ts`
- Test: `packages/shared/test/utf8.test.ts`

`onChunkReceived` 给的是 ArrayBuffer，分块边界可能落在一个汉字或 emoji 的多字节序列中间。解码器把不完整的尾部字节缓存到下一次 `push`，不依赖 `TextDecoder`（部分小程序基础库没有）。非法字节输出 U+FFFD，不抛错，避免一个坏字节中断整段回答。

- [ ] **Step 1: 写失败测试 `packages/shared/test/utf8.test.ts`**

测试里用 Node 的 `TextEncoder` 造字节，只在测试中使用，不进 `src/`。

```ts
import { describe, expect, it } from 'vitest'
import { Utf8StreamDecoder } from '../src/stream/utf8.js'

const TEXT = '你好 world，摸鱼🐟回血 ok'
const bytes = new TextEncoder().encode(TEXT)

function decodeAll(chunks: Uint8Array[]): string {
  const d = new Utf8StreamDecoder()
  return chunks.map((c) => d.push(c)).join('') + d.flush()
}

describe('Utf8StreamDecoder', () => {
  it('整块解码', () => {
    expect(decodeAll([bytes])).toBe(TEXT)
  })
  it('在每个字节位置切成两块，重组结果与原文一致', () => {
    for (let i = 0; i <= bytes.length; i++) {
      expect(decodeAll([bytes.slice(0, i), bytes.slice(i)])).toBe(TEXT)
    }
  })
  it('任意两个切点切成三块，结果一致', () => {
    for (let i = 0; i <= bytes.length; i++) {
      for (let j = i; j <= bytes.length; j++) {
        expect(decodeAll([bytes.slice(0, i), bytes.slice(i, j), bytes.slice(j)])).toBe(TEXT)
      }
    }
  })
  it('逐字节推送', () => {
    expect(decodeAll(Array.from(bytes, (b) => Uint8Array.of(b)))).toBe(TEXT)
  })
  it('不完整序列在下一块到来前不输出', () => {
    const d = new Utf8StreamDecoder()
    const ni = new TextEncoder().encode('你') // 3 字节
    expect(d.push(ni.slice(0, 2))).toBe('')
    expect(d.push(ni.slice(2))).toBe('你')
  })
  it('非法字节输出 U+FFFD，不影响后续文本', () => {
    expect(decodeAll([Uint8Array.of(0x80, 0x41)])).toBe('�A')
    expect(decodeAll([Uint8Array.of(0xc0, 0xaf, 0x41)])).toBe('��A') // 过长编码
    expect(decodeAll([Uint8Array.of(0xed, 0xa0, 0x80)])).toBe('���') // 代理区
  })
  it('flush 时残留不完整序列输出一个 U+FFFD', () => {
    const d = new Utf8StreamDecoder()
    expect(d.push(Uint8Array.of(0xe4, 0xbd))).toBe('')
    expect(d.flush()).toBe('�')
    expect(d.flush()).toBe('')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- utf8`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/stream/utf8.ts`**

按 WHATWG Encoding 标准的 UTF-8 解码算法实现：用 `lower`/`upper` 收窄第二个字节的合法范围，过长编码、代理区（U+D800–DFFF）、超过 U+10FFFF 的序列都会在第二个字节处被拒绝。遇到范围外的字节时先输出一个 U+FFFD，再把这个字节当作新序列的开头重新处理。

```ts
// packages/shared/src/stream/utf8.ts
const REPLACEMENT = '�'

/** 流式 UTF-8 解码：不完整的尾部字节留到下一次 push */
export class Utf8StreamDecoder {
  private codePoint = 0
  private needed = 0
  private seen = 0
  private lower = 0x80
  private upper = 0xbf

  push(chunk: Uint8Array): string {
    let out = ''
    let i = 0
    while (i < chunk.length) {
      const b = chunk[i]!
      if (this.needed === 0) {
        i++
        if (b <= 0x7f) {
          out += String.fromCharCode(b)
        } else if (b >= 0xc2 && b <= 0xdf) {
          this.needed = 1
          this.codePoint = b & 0x1f
        } else if (b >= 0xe0 && b <= 0xef) {
          if (b === 0xe0) this.lower = 0xa0
          if (b === 0xed) this.upper = 0x9f
          this.needed = 2
          this.codePoint = b & 0x0f
        } else if (b >= 0xf0 && b <= 0xf4) {
          if (b === 0xf0) this.lower = 0x90
          if (b === 0xf4) this.upper = 0x8f
          this.needed = 3
          this.codePoint = b & 0x07
        } else {
          out += REPLACEMENT
        }
        continue
      }
      if (b < this.lower || b > this.upper) {
        // 不消费当前字节（i 不前进），重置后把它当作新序列的开头
        this.reset()
        out += REPLACEMENT
        continue
      }
      i++
      this.lower = 0x80
      this.upper = 0xbf
      this.codePoint = (this.codePoint << 6) | (b & 0x3f)
      this.seen++
      if (this.seen === this.needed) {
        out += String.fromCodePoint(this.codePoint)
        this.reset()
      }
    }
    return out
  }

  /** 流结束时调用；残留的不完整序列输出一个 U+FFFD */
  flush(): string {
    if (this.needed === 0) return ''
    this.reset()
    return REPLACEMENT
  }

  private reset(): void {
    this.codePoint = 0
    this.needed = 0
    this.seen = 0
    this.lower = 0x80
    this.upper = 0xbf
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- utf8`
Expected: PASS，7 个用例全部通过。

- [ ] **Step 5: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './stream/utf8.js'
```

```bash
git add packages/shared/src/stream/utf8.ts packages/shared/src/index.ts packages/shared/test/utf8.test.ts
git commit -m "feat(shared): add streaming utf-8 decoder"
```

---

### Task 11：SSE 帧解析器与格式化

**Files:**
- Create: `packages/shared/src/stream/sse.ts`
- Test: `packages/shared/test/sse.test.ts`

server 用 `formatSseFrame` 写帧，小程序用 `SseParser` 读帧，两边共用一份实现，格式不会漂移。约定：
- 每帧 `event: <type>\ndata: <JSON>\n\n`。`JSON.stringify` 会把文本里的换行转义成 `\n`，所以 `data` 永远只有一行。
- 心跳是注释行 `: ping\n\n`，解析器直接丢弃。
- 支持 `\n` 和 `\r\n` 行尾；不支持单独的 `\r`（server 从不输出）。
- 没有 `data` 的帧不产出；没有 `event` 时按规范默认为 `message`。

- [ ] **Step 1: 写失败测试 `packages/shared/test/sse.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { SSE_PING, SseParser, formatSseFrame, type SseFrame } from '../src/stream/sse.js'
import { Utf8StreamDecoder } from '../src/stream/utf8.js'

function parseAll(chunks: string[]): SseFrame[] {
  const p = new SseParser()
  return chunks.flatMap((c) => p.push(c))
}

const STREAM =
  formatSseFrame('tool', { type: 'tool', name: 'get_score_summary', label: '正在查看你的评分' })
  + SSE_PING
  + formatSseFrame('delta', { type: 'delta', text: '你现在 47 分，\n处在🟠骑驴找马。' })
  + formatSseFrame('done', { type: 'done', messageId: 'm1' })

const EXPECTED: SseFrame[] = [
  { event: 'tool', data: JSON.stringify({ type: 'tool', name: 'get_score_summary', label: '正在查看你的评分' }) },
  { event: 'delta', data: JSON.stringify({ type: 'delta', text: '你现在 47 分，\n处在🟠骑驴找马。' }) },
  { event: 'done', data: JSON.stringify({ type: 'done', messageId: 'm1' }) },
]

describe('formatSseFrame', () => {
  it('输出 event + 单行 data + 空行', () => {
    expect(formatSseFrame('done', { type: 'done', messageId: 'm1' }))
      .toBe('event: done\ndata: {"type":"done","messageId":"m1"}\n\n')
  })
  it('文本中的换行被转义，data 只有一行', () => {
    const f = formatSseFrame('delta', { text: 'a\nb' })
    expect(f.split('\n').filter((l) => l.startsWith('data:'))).toHaveLength(1)
  })
})

describe('SseParser', () => {
  it('整块解析，心跳被丢弃', () => {
    expect(parseAll([STREAM])).toEqual(EXPECTED)
  })
  it('在每个字符位置切成两块，结果一致', () => {
    for (let i = 0; i <= STREAM.length; i++) {
      expect(parseAll([STREAM.slice(0, i), STREAM.slice(i)])).toEqual(EXPECTED)
    }
  })
  it('与 UTF-8 解码器串联：在每个字节位置切开，结果一致', () => {
    const bytes = new TextEncoder().encode(STREAM)
    for (let i = 0; i <= bytes.length; i++) {
      const d = new Utf8StreamDecoder()
      const p = new SseParser()
      const frames = [...p.push(d.push(bytes.slice(0, i))), ...p.push(d.push(bytes.slice(i)) + d.flush())]
      expect(frames).toEqual(EXPECTED)
    }
  })
  it('支持 \\r\\n 行尾', () => {
    expect(parseAll(['event: done\r\ndata: {}\r\n\r\n'])).toEqual([{ event: 'done', data: '{}' }])
  })
  it('没有 event 时默认为 message；没有 data 的帧不产出', () => {
    expect(parseAll(['data: x\n\n', 'event: lonely\n\n'])).toEqual([{ event: 'message', data: 'x' }])
  })
  it('多行 data 用 \\n 连接；冒号后只去掉一个空格', () => {
    expect(parseAll(['data: a\ndata:  b\n\n'])).toEqual([{ event: 'message', data: 'a\n b' }])
  })
  it('未结束的帧不产出，等到空行才产出', () => {
    const p = new SseParser()
    expect(p.push('event: done\ndata: {}\n')).toEqual([])
    expect(p.push('\n')).toEqual([{ event: 'done', data: '{}' }])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/shared test -- sse`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `packages/shared/src/stream/sse.ts`**

```ts
// packages/shared/src/stream/sse.ts
export interface SseFrame {
  event: string
  data: string
}

/** 心跳：SSE 注释行，客户端解析时丢弃 */
export const SSE_PING = ': ping\n\n'

export function formatSseFrame(event: string, payload: unknown): string {
  // JSON.stringify 会转义换行，保证 data 只有一行
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

/** 增量 SSE 解析：push 任意切分的文本，返回已完整的帧 */
export class SseParser {
  private buffer = ''
  private event = ''
  private data: string[] = []

  push(text: string): SseFrame[] {
    this.buffer += text
    const frames: SseFrame[] = []
    let nl = this.buffer.indexOf('\n')
    while (nl !== -1) {
      let line = this.buffer.slice(0, nl)
      this.buffer = this.buffer.slice(nl + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      const frame = this.handleLine(line)
      if (frame) frames.push(frame)
      nl = this.buffer.indexOf('\n')
    }
    return frames
  }

  private handleLine(line: string): SseFrame | null {
    if (line === '') {
      const frame = this.data.length > 0 ? { event: this.event || 'message', data: this.data.join('\n') } : null
      this.event = ''
      this.data = []
      return frame
    }
    if (line.startsWith(':')) return null
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') this.event = value
    else if (field === 'data') this.data.push(value)
    // id / retry 本项目不用，忽略
    return null
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/shared test -- sse`
Expected: PASS，9 个用例全部通过。

- [ ] **Step 5: 导出并提交**

`packages/shared/src/index.ts` 追加：

```ts
export * from './stream/sse.js'
```

```bash
git add packages/shared/src/stream/sse.ts packages/shared/src/index.ts packages/shared/test/sse.test.ts
git commit -m "feat(shared): add sse parser and frame formatter"
```

---

### Task 12：阶段收尾

**Files:**
- 无新增

- [ ] **Step 1: 全量测试、类型检查、构建**

Run: `pnpm --filter @should-quit/shared test && pnpm --filter @should-quit/shared typecheck && pnpm --filter @should-quit/shared build`
Expected: 全部用例通过；类型检查无报错；`dist/` 生成 `index.js`、`index.d.ts` 及各子模块。

- [ ] **Step 2: 确认产物没有 Node/DOM 依赖**

Run: `grep -rnE --include='*.js' "Buffer|TextDecoder|TextEncoder|Intl\.|require\(|from 'node:" packages/shared/dist || echo CLEAN`
Expected: 输出 `CLEAN`。只查 `.js`，`.d.ts` 和 sourcemap 不进运行时。

- [ ] **Step 3: 确认 ES2019 产物可被 Node 直接加载**

Run: `cd packages/shared && node --input-type=module -e "import('./dist/index.js').then((m) => console.log(m.tierOf(47), m.ALGO_VERSION))"`
Expected: 输出 `SEEK 1`。如果报 `ERR_MODULE_NOT_FOUND` 且路径没有 `.js` 后缀，说明某个源文件的相对导入漏写了 `.js`，回到该文件补上。

- [ ] **Step 4: 根目录全量检查**

Run: `pnpm -r test && pnpm -r typecheck`
Expected: 只有 shared 一个子包，全部通过。

Phase 2 完成的标志：shared 全部测试通过、构建产物干净。Phase 3 与 Phase 5 依赖本阶段的导出。

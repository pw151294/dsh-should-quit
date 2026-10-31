# 「该溜吗」MVP 实施计划：总览与跨阶段契约

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按设计文档 `docs/superpowers/specs/2026-10-31-should-quit-design.md` 交付「该溜吗」微信小程序 MVP：基准录入、心情打卡、评分与档位、趋势、只读智能体顾问。

**Architecture:** pnpm monorepo。`packages/shared` 放纯函数评分引擎、档位、DTO、流解析器，前后端共用。`apps/server` 是 NestJS + Prisma + MySQL，对外提供 `/api`，另起一个只监听 127.0.0.1 的 internal 应用供 dsh 工具回调。`apps/agent-plugin` 是 dsh 的 Cordis 插件与 profile patch。`apps/miniapp` 是 Taro + React 小程序。

**Tech Stack:** TypeScript 5.9.3、Node ≥ 24（本机 25.6.1）、pnpm 12.16.1、NestJS 12.3.2、Prisma 7.10.1 + `@prisma/adapter-mariadb`、MySQL 8.0、zod 4.6.7、vitest 5.0.5、Taro 4.3.1 + React 18.3.1、zustand 5.0.16、Canvas 2D 自绘折线图（无图表依赖）、`@deepseek-ai/dsh-sdk-client` 0.2.1-rc.5。

---

## 1. 计划文件与执行顺序

| 文件 | 阶段 | 依赖 | 产出 |
|---|---|---|---|
| `...-01-dsh-spike.md` | Phase 1：dsh 技术验证 | 无 | `spike/` 脚本 + `docs/superpowers/spike-result.md`，决定 `AGENT_ENGINE` |
| `...-02-foundation-shared.md` | Phase 2：monorepo 脚手架 + shared | 无（可与 Phase 1 并行） | `packages/shared` 全部模块与单测 |
| `...-03-server-core.md` | Phase 3：后端核心 | Phase 2 | Prisma schema、登录、基准、打卡、评分、趋势、e2e 测试 |
| `...-04-agent.md` | Phase 4：智能体模块 | Phase 1 结论 + Phase 3 | internal 接口、AgentService、3 种引擎、插件、SSE |
| `...-05-miniapp.md` | Phase 5：小程序 | Phase 2；联调需 Phase 3/4 | Taro 工程、请求/流式封装、全部页面 |

每个阶段结束时都能独立构建、测试通过，并提交。

## 2. 依赖版本（全部锁精确版本，`package.json` 中不写 `^`）

| 包 | 版本 | 用于 | 备注 |
|---|---|---|---|
| typescript | 5.9.3 | 全部 | 不用 7.x：原生编译器与 Taro/Nest 装饰器兼容性未验证 |
| vitest | 5.0.5 | shared、server、miniapp | |
| zod | 4.6.7 | shared | 前后端共用 schema |
| @nestjs/core / common / platform-express / testing | 12.3.2 | server | |
| @nestjs/jwt | 12.0.3 | server | |
| reflect-metadata | 0.2.2 | server | |
| rxjs | 7.8.2 | server | Nest peer |
| prisma / @prisma/client / @prisma/adapter-mariadb | 7.10.1 | server | 不用 8.0 rc |
| nestjs-pino | 5.3.1 | server | 另需其 peer `pino-http`，Phase 3 用 `npm view` 确认版本后锁定 |
| pino | 10.4.0 | server | |
| supertest | 7.3.1 | server 测试 | |
| unplugin-swc 2.0.0 + @swc/core 1.16.21 | | server 测试 | vitest 默认 esbuild 不输出 `emitDecoratorMetadata`，Nest DI 需要它 |
| tsx | 4.23.15 | server 开发、spike | |
| @deepseek-ai/dsh-sdk-client / dsh-llm / dsh-session / dsh-sdk-protocol / dsh-tools | 0.2.1-rc.5 | server、agent-plugin、spike | |
| @deepseek-ai/cordis | 4.0.5 | 同上 | sdk-client 的 peer `~4.0.5` |
| @tarojs/* | 4.3.1 | miniapp | |
| react / react-dom | 18.3.1 | miniapp | Taro 4.3.1 peer 为 `react ^18` |
| zustand | 5.0.16 | miniapp | |
| （不引入日期库） | | shared | Asia/Shanghai 自 1991 年起固定 UTC+8、无夏令时，`localDate` 直接按 +8 小时偏移计算。不依赖 `Intl` 时区数据，部分小程序基础库的 `Intl` 不完整 |

折线图不引入 ECharts，改为 Canvas 2D 自绘（设计文档 §7.2 已同步更新）。

## 3. 与设计文档的差异（来自 dsh 0.2.1-rc.5 包调研）

| 设计文档原文 | 调研结论 | 计划中的处理 |
|---|---|---|
| `onNotification` 可能拿到增量文本 | SDK 协议没有 text-delta 通知。`assistant/message` 在每个 step 结束后才发一次 | `delta` 事件按 step 粒度推送：模型调工具前后的每段文字各推一次。真正逐字流式不在 MVP 内。前端解析和展示逻辑不变 |
| 工具开始时推 `tool` 事件 | 有 `tool/call` 事件，带工具名 | `tool/call` → SSE `tool`，label 从 `agent.json` 的工具状态文案取 |
| 工具代码拿到 sessionId | `execute(args, exec)` 中 `exec.agent?.id` 就是 sessionId | Spike 第 2 条直接验证这个字段 |
| patch 移除 bash/fs/web | 按 row `id` 设 `disabled: true`；只禁 `tool-*` 行，不禁服务行 | patch 内容见 Phase 1 Task 2 |
| 系统提示 | 通过 `system-prompt` row 的 `personaPrefix` 设置；patch 会整体替换该行 config | 服务启动时把 `agent-prompt.md`（已注入 `{{hotline}}`）写成生成的 patch 文件 `var/should-quit.generated.cordis.yml`，再传给 `patches`。不使用 `{{cwd}}` |
| 本地插件用 `.ts` 编写 | Loader 只加载 `.js`；`./` 相对路径会被转成 file URL | `apps/agent-plugin` 用 TS 编写，`tsc` 编译到 `dist/index.js`，patch 引用编译产物 |

尚未确认、由 Spike 验证的两点：
1. patch 相对路径加载的本地插件能否解析 `@deepseek-ai/dsh-tools`。不行时，插件不 import `defineTool`，直接按 `ToolDefinition` 结构传对象（`defineTool` 只做类型收窄）。
2. 是否存在按会话注册系统提示的钩子。MVP 不需要：系统提示全局一份，用户数据只通过工具或数据区块传入。

## 4. 跨阶段契约

以下名称与签名在各阶段文件中引用，执行时不得改名。

**`packages/shared`（包名 `@should-quit/shared`）导出：**

```ts
// scoring
export const ALGO_VERSION = 1
export const BASELINE_FIELDS = ['salary','overtime','growth','workload','contentFit','commute','restTime','stabilityBenefits'] as const
export type BaselineField = typeof BASELINE_FIELDS[number]
export type BaselineInput = Record<BaselineField, 1 | 2 | 3 | 4 | 5>
export function objectiveScore(b: BaselineInput): { score: number; breakdown: Record<BaselineField, number> }
export function starsToScore(stars: number): number
export function moodScore(daily: { age: number; avg: number }[]): number | null
export function totalScore(objective: number, mood: number | null): number   // 已四舍五入整数
export type Tier = 'RUN' | 'SEEK' | 'WATCH' | 'STAY'
export function tierOf(total: number): Tier
export function computeScore(b: BaselineInput, daily: { age: number; avg: number }[]): ScoreResult
// time
export const APP_TZ = 'Asia/Shanghai'
export function localDate(at: Date): string          // 'YYYY-MM-DD'
export function daysBetween(from: string, to: string): number
export function shiftDate(date: string, days: number): string   // 'YYYY-MM-DD' 加减 n 天
// stream
export class Utf8StreamDecoder { push(chunk: Uint8Array): string; flush(): string }
export class SseParser { push(text: string): SseFrame[] }   // SseFrame = { event: string; data: string }
// errors / dto
export const ErrorCode: { ... }   // 设计文档 §5 对照表中的全部错误码
export const errorHttpStatus: Record<ErrorCode, number | null>
export const baselineSchema, moodCreateSchema, askSchema, trendQuerySchema, dailyQuerySchema
// —— Phase 2 细化时补充的导出（同样不得改名）——
export function addDays(date: string, n: number): string
export function aggregateDaily(checkins: { checkinDate: string; stars: number }[], today: string, windowDays?: number): DailyMood[]
//   DailyMood = { date: string; age: number; avg: number; count: number }，avg 为 0–100
export interface ScoreResult { objectiveScore: number; moodScore: number | null; totalScore: number; tier: Tier; breakdown: Record<BaselineField, number>; algoVersion: number }
export const TIER_RANGES, TIERS, BASELINE_WEIGHTS, MOOD_WINDOW_DAYS, TREND_RANGE_DAYS
export const BASELINE_OPTIONS: readonly BaselineQuestion[]
export function levelLabel(field: BaselineField, level: Level): string
export const SSE_PING: string
export function formatSseFrame(event: string, data: string): string
export function formatAgentEvent(e: AgentEvent): string
export function parseAgentEvent(frame: SseFrame): AgentEvent | null
export const loginSchema, moodDateQuerySchema
// 响应类型：ScoreView、TierCopy、UserView、LoginResponse、MoodCreateResponse、DailyMoodView、MoodCheckinView、
//          SnapshotView、TrendResponse、ConversationView、MessageView、AgentConfigView、AgentEvent
// ErrorCode 比设计文档对照表多一个 INTERNAL_ERROR（500），用于未预期异常
```

**环境变量（`apps/server/.env.example`）：**

```
DATABASE_URL=mysql://root:@127.0.0.1:3306/should_quit
DATABASE_URL_TEST=mysql://root:@127.0.0.1:3306/should_quit_test
PORT=3000
INTERNAL_PORT=3100
INTERNAL_TOKEN=change-me-32-bytes-random
JWT_SECRET=change-me
AUTH_MODE=mock                 # mock | wechat
WECHAT_APPID=
WECHAT_SECRET=
AGENT_ENGINE=dsh-tools         # dsh-tools | dsh-context | fake
DEEPSEEK_API_KEY=
DSH_HOME_DIR=./var/dsh-home
```

`AGENT_ENGINE=fake` 只在测试和无 API Key 的本地开发中使用。

## 5. 全局约定

- 每个 Task 遵循 TDD：先写失败测试 → 运行确认失败 → 最小实现 → 运行确认通过 → 提交。
- 提交信息用 Conventional Commits（`feat:`、`test:`、`chore:`、`docs:`），每个 Task 至少一次提交。
- 只 `git add` 本 Task 列出的文件，不用 `git add .`。`.env` 不入库，只提交 `.env.example`。
- 根目录 `pnpm -r test` 和 `pnpm -r typecheck` 在每个阶段结束时必须全绿。
- 不在日志中输出备注、聊天内容、API Key、JWT。


# Phase 3：后端核心（NestJS + Prisma + MySQL）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 `apps/server` 的对外接口：登录、基准、打卡、评分、趋势，带统一错误格式和 e2e 测试。智能体相关接口留给 Phase 4。

**Architecture:** NestJS 12 + Express 5，纯 ESM。Prisma 7 用 `prisma-client` 生成器 + `@prisma/adapter-mariadb` 驱动适配器连 MySQL 8。评分全部调用 `@should-quit/shared`，server 只负责取数、落库和鉴权。“当前时间”通过可注入的 `Clock` 提供，测试里固定时间，用来验证时区和 30 天窗口。

**Tech Stack:** NestJS 12.3.2、@nestjs/jwt 12.0.3、Prisma 7.10.1 + @prisma/adapter-mariadb 7.10.1、zod 4.6.7、nestjs-pino 5.3.1 + pino 10.4.0 + pino-http 11.0.0、vitest 5.0.5 + unplugin-swc 2.0.0、supertest 7.3.1。

**前置：** Phase 2 完成（`@should-quit/shared` 已构建）。本机 MySQL 8 可用。先读 `00-overview.md` 第 4 节契约。

---

## 调研结论（写计划时已核实，执行时不要改回去）

| 事项 | 结论 | 计划中的处理 |
|---|---|---|
| NestJS 12 | 包是纯 ESM | server 用 `"type": "module"`、`module: NodeNext`，相对导入写 `.js` 后缀 |
| 装饰器元数据 | Nest 依赖注入需要 `emitDecoratorMetadata`，esbuild/tsx 不输出它 | 构建用 `tsc`，测试用 unplugin-swc。不要用 tsx 跑 server |
| Prisma 7 配置文件 | 7.10.1 优先查找 `prisma7.config.ts`，旧名 `prisma.config.ts` 只作兼容 | 用 `prisma7.config.ts` |
| Prisma 7 连接串 | `schema.prisma` 的 `datasource` 不再写 `url`；迁移命令读配置文件的 `datasource.url` | 配置文件写 `url: process.env.DATABASE_URL`；`prisma generate` 不需要它 |
| Prisma 7 生成器 | `prisma-client` 生成器必须写 `output` | 生成到 `src/generated/prisma`，不入库，`build`/`test` 前自动 `prisma generate` |
| 运行时连接 | Prisma 7 必须传驱动适配器 | `new PrismaClient({ adapter: new PrismaMariaDb(config) })` |
| 字符集 | 备注和聊天内容会有 emoji | 建库指定 `utf8mb4` |
| `GET /api/baseline` 未录入 | Nest 返回 `null` 时响应体为空，小程序无法按 JSON 解析 | 改为返回 `{ baseline: null }`，新增共享类型 `BaselineResponse`（Task 8） |
| mock 登录的 code | 真实 `wx.login` 每次返回新 code，mock 模式下直接当 openid 会每次登录都建新用户 | mock 模式下小程序发送本地持久化的设备随机 id 作为 code（Phase 5 实现）；server 侧限制 code ≤ 59 字符，保证 `mock_<code>` 不超过 `openid` 的 64 字符 |
| Node 超时 | `headersTimeout` 不能大于 `requestTimeout`，且只约束请求头到达时间 | `requestTimeout = 330000`，`headersTimeout` 保持默认 60000（设计文档 §6.7 的“同步调大”按此理解） |

## 文件结构（路径相对 `apps/server/`）

| 文件 | 职责 |
|---|---|
| `package.json`、`tsconfig.json`、`tsconfig.build.json`、`vitest.config.ts` | 工程配置 |
| `prisma7.config.ts`、`prisma/schema.prisma`、`prisma/migrations/` | 数据模型与迁移 |
| `.env.example`、`config/tiers.json` | 环境变量模板、档位文案 |
| `src/env.ts` | 环境变量 zod 校验、`ENV` 注入令牌 |
| `src/clock.ts` | `Clock` 抽象，`now()` / `today()` |
| `src/db-date.ts` | `'YYYY-MM-DD'` 与 `@db.Date` 列互转 |
| `src/prisma/prisma.service.ts` | PrismaClient 生命周期（连接串直接交给 `PrismaMariaDb`） |
| `src/tiers/tier-copy.ts` | 加载并校验 `tiers.json` |
| `src/common/app-error.ts`、`error.filter.ts`、`zod.pipe.ts` | 业务错误、全局异常格式、参数校验 |
| `src/core.module.ts` | 全局模块：ENV、Clock、TIER_COPY、PrismaService |
| `src/auth/*` | 登录（mock / wechat）、JWT、全局守卫、`@Public()`、`@UserId()` |
| `src/score/*` | 实时评分、快照 upsert、趋势 |
| `src/baseline/*` | 基准读写、`BaselineRequiredGuard` |
| `src/mood/*` | 打卡、日均、当天明细 |
| `src/app.module.ts`、`src/setup.ts`、`src/main.ts` | 组装、全局配置、启动 |
| `test/setup/global.ts`、`test/setup/test-db.ts`、`test/helpers.ts` | 测试库迁移、安全检查、测试应用工厂 |
| `test/*.test.ts` | 单测与 e2e |

---

### Task 1：server 工程配置

**Files:**
- Create: `apps/server/package.json`、`tsconfig.json`、`tsconfig.build.json`、`vitest.config.ts`、`.env.example`、`test/setup/reflect.ts`
- Modify: `.gitignore`

- [ ] **Step 1: 创建 `apps/server/package.json`**

```json
{
  "name": "@should-quit/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "prisma generate && tsc -p tsconfig.build.json",
    "start": "node --env-file-if-exists=.env dist/main.js",
    "test": "prisma generate && vitest run",
    "typecheck": "prisma generate && tsc -p tsconfig.json --noEmit",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@nestjs/common": "12.3.2",
    "@nestjs/core": "12.3.2",
    "@nestjs/jwt": "12.0.3",
    "@nestjs/platform-express": "12.3.2",
    "@prisma/adapter-mariadb": "7.10.1",
    "@prisma/client": "7.10.1",
    "@should-quit/shared": "workspace:*",
    "nestjs-pino": "5.3.1",
    "pino": "10.4.0",
    "pino-http": "11.0.0",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@nestjs/testing": "12.3.2",
    "@swc/core": "1.16.21",
    "@types/express": "5.0.0",
    "@types/supertest": "7.2.1",
    "prisma": "7.10.1",
    "supertest": "7.3.1",
    "unplugin-swc": "2.0.0",
    "vitest": "5.0.5"
  }
}
```

`@types/express`、`@types/supertest` 的版本执行前用 `npm view @types/express@5 version`、`npm view @types/supertest version` 查最新值替换。`pino-http` 必须满足 nestjs-pino 5.3.1 的 peer `^11.0.0`。

- [ ] **Step 2: 创建两份 tsconfig**

```json
// apps/server/tsconfig.json —— 类型检查，含测试
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "isolatedModules": false,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "test", "vitest.config.ts", "prisma7.config.ts"]
}
```

```json
// apps/server/tsconfig.build.json —— 产物
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`isolatedModules: false`：开启时，装饰器参数里引用的类型别名（如 `BaselineBody`）必须改成 `import type`，否则报 TS1272。server 只用 `tsc` 整体编译，不需要单文件隔离。

- [ ] **Step 3: 创建 `apps/server/vitest.config.ts` 与 `test/setup/reflect.ts`**

vitest 主进程先加载 `.env`，再用 `test.env` 把 `DATABASE_URL` 指向测试库，worker 进程只会看到测试库地址。`fileParallelism: false`：所有 e2e 共用一个测试库，串行跑避免互相清表。

```ts
// apps/server/vitest.config.ts
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

try { process.loadEnvFile('.env') } catch { /* 没有 .env 时用进程环境（CI） */ }

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup/reflect.ts'],
    globalSetup: ['test/setup/global.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789',
      INTERNAL_TOKEN: 'test-internal-token-0123456789abcdef01234',
      AUTH_MODE: 'mock',
      AGENT_ENGINE: 'fake',
    },
  },
})
```

```ts
// apps/server/test/setup/reflect.ts —— Nest 依赖注入读取装饰器元数据前必须先加载
import 'reflect-metadata'
```

`test/setup/global.ts` 在 Task 2 创建，在那之前不要运行 `pnpm test`。

- [ ] **Step 4: 创建 `apps/server/.env.example`**

内容与 `00-overview.md` 第 4 节一致。`JWT_SECRET`、`INTERNAL_TOKEN` 在 `src/env.ts` 里要求至少 32 个字符，占位值启动会失败，这是有意的：本地复制成 `.env` 后用 `openssl rand -hex 32` 生成真实值。

```ini
DATABASE_URL=mysql://root:@127.0.0.1:3306/should_quit
DATABASE_URL_TEST=mysql://root:@127.0.0.1:3306/should_quit_test
PORT=3000
INTERNAL_PORT=3100
# openssl rand -hex 32
INTERNAL_TOKEN=change-me
# openssl rand -hex 32
JWT_SECRET=change-me
AUTH_MODE=mock
WECHAT_APPID=
WECHAT_SECRET=
AGENT_ENGINE=fake
DEEPSEEK_API_KEY=
DSH_HOME_DIR=./var/dsh-home
```

`AGENT_ENGINE` 在本阶段只接受 `fake`；Phase 4 按 Spike 结论改为 `dsh-tools` 或 `dsh-context`。

- [ ] **Step 5: 更新根 `.gitignore`**

追加：

```gitignore
apps/server/src/generated/
```

- [ ] **Step 6: 安装依赖**

Run: `pnpm install`
Expected: 安装成功。`pnpm ls --filter @should-quit/server @should-quit/shared` 显示 `link:../../packages/shared`。

如果 pnpm 提示 `prisma`、`@prisma/engines`、`@swc/core` 的 install 脚本被跳过（pnpm 10+ 默认不跑依赖的构建脚本），在根 `package.json` 加：

```json
"pnpm": { "onlyBuiltDependencies": ["prisma", "@prisma/engines", "@swc/core"] }
```

然后重新 `pnpm install`，并把根 `package.json` 一起提交。

- [ ] **Step 7: Commit**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/vitest.config.ts apps/server/.env.example apps/server/test/setup/reflect.ts .gitignore pnpm-lock.yaml package.json
git commit -m "chore(server): scaffold nestjs server package"
```

---

### Task 2：Prisma schema、迁移与测试库

**Files:**
- Create: `apps/server/prisma7.config.ts`、`prisma/schema.prisma`、`prisma/migrations/`（生成）
- Create: `apps/server/test/setup/test-db.ts`、`test/setup/global.ts`
- Test: `apps/server/test/test-db.test.ts`

- [ ] **Step 1: 创建 `apps/server/prisma7.config.ts`**

Prisma 7 不再自动读 `.env`。这里只在 `DATABASE_URL` 未设置时才加载 `.env`，这样测试的 globalSetup 显式传入测试库地址时不会被开发库覆盖。

```ts
// apps/server/prisma7.config.ts
import { defineConfig } from 'prisma/config'

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env') } catch { /* 没有 .env 时用进程环境 */ }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // generate 不需要连接串；migrate 命令缺少它时 Prisma 会明确报错
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
```

- [ ] **Step 2: 创建 `apps/server/prisma/schema.prisma`**

表结构与设计文档 §4 一致。`moduleFormat`/`importFileExtension` 让生成代码符合 NodeNext ESM（相对导入带 `.js`）。

```prisma
generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  moduleFormat        = "esm"
  importFileExtension = "js"
}

datasource db {
  provider = "mysql"
}

model User {
  id        String   @id @default(cuid())
  openid    String   @unique @db.VarChar(64)
  nickname  String?  @db.VarChar(64)
  avatarUrl String?  @db.VarChar(512)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Baseline {
  userId            String   @id
  salary            Int      @db.TinyInt
  commute           Int      @db.TinyInt
  overtime          Int      @db.TinyInt
  restTime          Int      @db.TinyInt
  workload          Int      @db.TinyInt
  stabilityBenefits Int      @db.TinyInt
  growth            Int      @db.TinyInt
  contentFit        Int      @db.TinyInt
  updatedAt         DateTime @updatedAt
}

model MoodCheckin {
  id          String   @id @default(cuid())
  userId      String
  stars       Int      @db.TinyInt
  note        String?  @db.VarChar(200)
  checkinDate DateTime @db.Date
  createdAt   DateTime @default(now()) @db.DateTime(3)

  @@index([userId, checkinDate])
}

model ScoreSnapshot {
  id             String   @id @default(cuid())
  userId         String
  snapshotDate   DateTime @db.Date
  objectiveScore Decimal  @db.Decimal(5, 2)
  moodScore      Decimal? @db.Decimal(5, 2)
  totalScore     Int      @db.TinyInt
  tier           Tier
  breakdown      Json
  algoVersion    Int
  updatedAt      DateTime @updatedAt

  @@unique([userId, snapshotDate])
}

enum Tier {
  RUN
  SEEK
  WATCH
  STAY
}

model AgentConversation {
  id            String   @id @default(cuid())
  userId        String
  dshSessionId  String   @unique @db.VarChar(64)
  title         String?  @db.VarChar(64)
  createdAt     DateTime @default(now())
  lastMessageAt DateTime @default(now())

  @@index([userId, lastMessageAt])
}

model AgentMessage {
  id             String        @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String        @db.Text
  status         MessageStatus
  createdAt      DateTime      @default(now()) @db.DateTime(3)

  @@index([conversationId, createdAt])
}

enum MessageRole {
  USER
  ASSISTANT
}

enum MessageStatus {
  COMPLETE
  FAILED
  INTERRUPTED
}
```

智能体的两张表在本阶段一并建好，Phase 4 不再改 schema，避免两次迁移。

- [ ] **Step 3: 建库并生成首个迁移**

Run:
```bash
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS should_quit CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE DATABASE IF NOT EXISTS should_quit_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
cd apps/server && cp -n .env.example .env && pnpm prisma migrate dev --name init
```
Expected: 生成 `prisma/migrations/<时间戳>_init/migration.sql`，开发库建好 7 张表（含 `_prisma_migrations`），`src/generated/prisma/` 生成客户端。

如果本机 root 有密码，改 `.env` 里两个连接串，不要改 `.env.example`。执行前把 `.env` 里的 `JWT_SECRET`、`INTERNAL_TOKEN` 换成 `openssl rand -hex 32` 的输出。

- [ ] **Step 4: 检查生成的 SQL**

Run: `grep -nE "utf8mb4|DATE NOT NULL|DECIMAL\(5, 2\)|ENUM\('RUN'" apps/server/prisma/migrations/*_init/migration.sql`
Expected: 能看到 `checkinDate DATE NOT NULL`、`DECIMAL(5, 2)`、`ENUM('RUN', 'SEEK', 'WATCH', 'STAY')`，表默认字符集为 `utf8mb4`。如果字符集不是 utf8mb4，说明建库语句没生效，删库重建。

- [ ] **Step 5: 写测试库工具 `apps/server/test/setup/test-db.ts`**

安全检查是硬约束：库名不以 `_test` 结尾就拒绝执行，防止 `.env` 配错时清掉开发库。

```ts
// apps/server/test/setup/test-db.ts
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../../src/generated/prisma/client.js'

/** 从连接串取库名，不以 _test 结尾时抛错 */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL_TEST 未设置')
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!name.endsWith('_test')) throw new Error(`拒绝在非测试库上运行：${name}`)
  return name
}

/** 清空全部业务表（保留 _prisma_migrations） */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL)
  const tables = ['AgentMessage', 'AgentConversation', 'ScoreSnapshot', 'MoodCheckin', 'Baseline', 'User']
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
  for (const t of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``)
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
}

export function createTestPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL
  assertTestDatabase(url)
  return new PrismaClient({ adapter: new PrismaMariaDb(url!) })
}
```

`truncateAll` 的表名是代码里的常量，不来自外部输入，所以可以用 `$executeRawUnsafe`。`PrismaMariaDb` 的构造函数签名是 `(poolOrConfig: Pool | PoolConfig | string, options?)`，源码会把 `mysql:` 协议头转换成 `mariadb:`，所以直接传 `mysql://` 连接串即可（写计划时已核实 7.10.1 的产物）。

- [ ] **Step 6: 写 `apps/server/test/setup/global.ts`**

vitest 的 globalSetup 在所有测试文件之前跑一次：校验库名，再把迁移部署到测试库。

```ts
// apps/server/test/setup/global.ts
import { execFileSync } from 'node:child_process'
import { assertTestDatabase } from './test-db.js'

export default function setup(): void {
  try { process.loadEnvFile('.env') } catch { /* CI 用进程环境 */ }
  const url = process.env.DATABASE_URL_TEST
  assertTestDatabase(url)
  // 用参数数组调用，不经 shell 拼接
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}
```

- [ ] **Step 7: 写测试 `apps/server/test/test-db.test.ts`**

```ts
import { afterAll, describe, expect, it } from 'vitest'
import { assertTestDatabase, createTestPrisma, truncateAll } from './setup/test-db.js'

describe('test-db', () => {
  const prisma = createTestPrisma()
  afterAll(() => prisma.$disconnect())

  it('非 _test 库被拒绝', () => {
    expect(() => assertTestDatabase('mysql://root:@127.0.0.1:3306/should_quit')).toThrow(/拒绝/)
    expect(assertTestDatabase('mysql://root:@127.0.0.1:3306/should_quit_test')).toBe('should_quit_test')
  })
  it('迁移已部署，可写入并清空', async () => {
    await prisma.user.create({ data: { openid: 'mock_t1' } })
    expect(await prisma.user.count()).toBe(1)
    await truncateAll(prisma)
    expect(await prisma.user.count()).toBe(0)
  })
  it('utf8mb4：emoji 备注可往返', async () => {
    const u = await prisma.user.create({ data: { openid: 'mock_t2' } })
    const m = await prisma.moodCheckin.create({
      data: { userId: u.id, stars: 3, note: '摸鱼🐟', checkinDate: new Date('2026-10-31T00:00:00Z') },
    })
    expect((await prisma.moodCheckin.findUniqueOrThrow({ where: { id: m.id } })).note).toBe('摸鱼🐟')
    await truncateAll(prisma)
  })
})
```

- [ ] **Step 8: 运行确认通过**

Run: `pnpm --filter @should-quit/server test -- test-db`
Expected: globalSetup 输出 `No pending migrations` 或 `applied 1 migration`；3 个用例 PASS。

这里没有"先失败"步骤：被测对象是基础设施本身，迁移未部署时 Step 8 会直接失败，起到同样作用。

- [ ] **Step 9: Commit**

```bash
git add apps/server/prisma7.config.ts apps/server/prisma apps/server/test/setup/test-db.ts apps/server/test/setup/global.ts apps/server/test/test-db.test.ts
git commit -m "feat(server): add prisma schema, init migration and test db setup"
```

---

### Task 3：环境变量、时钟与日期列

**Files:**
- Create: `apps/server/src/env.ts`、`src/clock.ts`、`src/db-date.ts`
- Test: `apps/server/test/env.test.ts`、`test/clock.test.ts`

- [ ] **Step 1: 写失败测试 `apps/server/test/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env.js'

const BASE = {
  DATABASE_URL: 'mysql://root:@127.0.0.1:3306/should_quit_test',
  JWT_SECRET: 'x'.repeat(32),
  INTERNAL_TOKEN: 'y'.repeat(32),
}

describe('loadEnv', () => {
  it('最小配置通过，其余取默认值', () => {
    const env = loadEnv(BASE)
    expect(env.PORT).toBe(3000)
    expect(env.INTERNAL_PORT).toBe(3100)
    expect(env.AUTH_MODE).toBe('mock')
    expect(env.AGENT_ENGINE).toBe('fake')
  })
  it('端口从字符串转数字', () => {
    expect(loadEnv({ ...BASE, PORT: '8080' }).PORT).toBe(8080)
  })
  it('密钥不足 32 字符时拒绝，错误信息带字段名但不带值', () => {
    expect(() => loadEnv({ ...BASE, JWT_SECRET: 'short-secret' })).toThrow(/JWT_SECRET/)
    expect(() => loadEnv({ ...BASE, JWT_SECRET: 'short-secret' })).not.toThrow(/short-secret/)
  })
  it('连接串必须是 mysql://', () => {
    expect(() => loadEnv({ ...BASE, DATABASE_URL: 'postgres://x' })).toThrow(/DATABASE_URL/)
  })
  it('wechat 模式必须配置 AppID 与 Secret', () => {
    expect(() => loadEnv({ ...BASE, AUTH_MODE: 'wechat' })).toThrow(/WECHAT_APPID/)
    expect(loadEnv({ ...BASE, AUTH_MODE: 'wechat', WECHAT_APPID: 'wx1', WECHAT_SECRET: 's' }).AUTH_MODE).toBe('wechat')
  })
  it('production 环境禁止 mock 登录（任何 code 都能换到 token）', () => {
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/AUTH_MODE/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/env.test.ts`
Expected: FAIL，模块不存在。

这一步单独跑一个文件，globalSetup 仍会执行迁移部署；Task 2 已经让它可用。

- [ ] **Step 3: 实现 `apps/server/src/env.ts`**

校验失败时只报字段名和规则，不回显值，避免密钥进日志。

```ts
// apps/server/src/env.ts
import { z } from 'zod'

const secret = z.string().min(32, '至少 32 个字符（openssl rand -hex 32）')

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().startsWith('mysql://', '必须以 mysql:// 开头'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    INTERNAL_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
    INTERNAL_TOKEN: secret,
    JWT_SECRET: secret,
    AUTH_MODE: z.enum(['mock', 'wechat']).default('mock'),
    WECHAT_APPID: z.string().optional(),
    WECHAT_SECRET: z.string().optional(),
    AGENT_ENGINE: z.enum(['fake', 'dsh-tools', 'dsh-context']).default('fake'),
    DEEPSEEK_API_KEY: z.string().optional(),
    DSH_HOME_DIR: z.string().default('./var/dsh-home'),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && e.AUTH_MODE === 'mock') {
      ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'production 环境不允许 mock 登录' })
    }
    if (e.AUTH_MODE === 'wechat') {
      for (const k of ['WECHAT_APPID', 'WECHAT_SECRET'] as const) {
        if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'AUTH_MODE=wechat 时必填' })
      }
    }
  })

export type Env = z.infer<typeof schema>

/** Nest 注入令牌 */
export const ENV = Symbol('ENV')

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const r = schema.safeParse(source)
  if (!r.success) {
    const lines = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`环境变量校验失败：\n${lines.join('\n')}`)
  }
  return r.data
}
```

`DEEPSEEK_API_KEY` 在本阶段可选；Phase 4 会在 `AGENT_ENGINE` 不是 `fake` 时把它改成必填。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/server exec vitest run test/env.test.ts`
Expected: PASS，6 个用例。

- [ ] **Step 5: 写失败测试 `apps/server/test/clock.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { FixedClock, SystemClock } from '../src/clock.js'
import { fromDbDate, toDbDate } from '../src/db-date.js'

describe('Clock', () => {
  it('FixedClock 的 today 按北京时间计算', () => {
    expect(new FixedClock(new Date('2026-10-31T15:59:00Z')).today()).toBe('2026-10-31')
    expect(new FixedClock(new Date('2026-10-31T16:01:00Z')).today()).toBe('2026-11-01')
  })
  it('FixedClock 可推进时间', () => {
    const c = new FixedClock(new Date('2026-10-31T00:00:00Z'))
    c.advanceDays(2)
    expect(c.today()).toBe('2026-11-02')
  })
  it('SystemClock 返回当前时间', () => {
    const before = Date.now()
    expect(new SystemClock().now().getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe('db-date', () => {
  it("'YYYY-MM-DD' 与 @db.Date 的 UTC 零点互转", () => {
    const d = toDbDate('2026-10-31')
    expect(d.toISOString()).toBe('2026-10-31T00:00:00.000Z')
    expect(fromDbDate(d)).toBe('2026-10-31')
  })
  it('非法日期抛错', () => {
    expect(() => toDbDate('2026-02-30')).toThrow()
  })
})
```

- [ ] **Step 6: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/clock.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 7: 实现 `src/clock.ts` 与 `src/db-date.ts`**

`@db.Date` 列在 Prisma 里是 `Date` 对象，值为该日 UTC 零点。所有“本地日期”在代码里一律用 `'YYYY-MM-DD'` 字符串流转，只在读写数据库时经过这两个函数转换，避免运行环境时区掺进来。

```ts
// apps/server/src/clock.ts
import { localDate } from '@should-quit/shared'

export abstract class Clock {
  abstract now(): Date
  /** Asia/Shanghai 本地日期 'YYYY-MM-DD' */
  today(): string {
    return localDate(this.now())
  }
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date()
  }
}

/** 测试用：固定时间，可手动推进 */
export class FixedClock extends Clock {
  constructor(private at: Date) {
    super()
  }
  now(): Date {
    return new Date(this.at.getTime())
  }
  set(at: Date): void {
    this.at = at
  }
  advanceDays(n: number): void {
    this.at = new Date(this.at.getTime() + n * 24 * 60 * 60 * 1000)
  }
}
```

```ts
// apps/server/src/db-date.ts
import { shiftDate } from '@should-quit/shared'

/** 'YYYY-MM-DD' → @db.Date 列使用的 UTC 零点 Date */
export function toDbDate(date: string): Date {
  shiftDate(date, 0) // 非法日期在这里抛错
  return new Date(`${date}T00:00:00.000Z`)
}

/** @db.Date 列读出的 Date → 'YYYY-MM-DD' */
export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

`Clock` 用抽象类而不是 interface：Nest 用类本身作为注入令牌，测试里 `overrideProvider(Clock).useValue(new FixedClock(...))` 即可替换。

- [ ] **Step 8: 运行确认通过并提交**

Run: `pnpm --filter @should-quit/server exec vitest run test/env.test.ts test/clock.test.ts`
Expected: PASS，11 个用例。

```bash
git add apps/server/src/env.ts apps/server/src/clock.ts apps/server/src/db-date.ts apps/server/test/env.test.ts apps/server/test/clock.test.ts
git commit -m "feat(server): add env validation, clock and db date helpers"
```

---

### Task 4：档位文案、PrismaService 与全局模块

**Files:**
- Create: `apps/server/config/tiers.json`、`src/tiers/tier-copy.ts`、`src/prisma/prisma.service.ts`、`src/prisma/errors.ts`、`src/core.module.ts`
- Test: `apps/server/test/tier-copy.test.ts`

- [ ] **Step 1: 创建 `apps/server/config/tiers.json`**

文案与设计文档 §3.3 表格逐字一致。

```json
{
  "RUN": {
    "label": "🔴 快跑预警",
    "slogan": "这份工作，快跑别犹豫",
    "guidance": "客观条件较差，且长期情绪持续内耗。不建议继续消耗自己，请提前准备退路、梳理简历，做好资金储备，严禁冲动裸辞。"
  },
  "SEEK": {
    "label": "🟠 骑驴找马",
    "slogan": "骑驴找马，悄悄看机会",
    "guidance": "工作短板明显，负面感受居多，但尚有可取之处。稳住现有收入，同步浏览外部机会，坚持打卡观察后续变化，不要贸然离职。"
  },
  "WATCH": {
    "label": "🟡 摸鱼观望期",
    "slogan": "适度摸鱼观望，摸的鱼都是赚到的",
    "guidance": "这份工作算不上最优选择，但暂时没有迫切离开的必要。不必强行内卷透支自己，守住本职底线，适当松弛、摸鱼回血，一边观望机会，一边持续记录心情，静待变化。"
  },
  "STAY": {
    "label": "🟢 值得坚守",
    "slogan": "挖到宝了，好好珍惜",
    "guidance": "硬条件和主观感受匹配度高，是适配度很好的岗位。若无极具吸引力的新机会，不建议轻易变动，可以安心深耕。"
  }
}
```

- [ ] **Step 2: 写失败测试 `apps/server/test/tier-copy.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_TIERS_PATH, loadTierCopy, parseTierCopy } from '../src/tiers/tier-copy.js'

const ok = { label: 'l', slogan: 's', guidance: 'g' }

describe('tier copy', () => {
  it('仓库内的 tiers.json 四档齐全', () => {
    const copy = loadTierCopy(DEFAULT_TIERS_PATH)
    expect(Object.keys(copy).sort()).toEqual(['RUN', 'SEEK', 'STAY', 'WATCH'])
    expect(copy.SEEK.slogan).toBe('骑驴找马，悄悄看机会')
  })
  it('缺档位、字段为空、多余字段都拒绝', () => {
    expect(() => parseTierCopy({ RUN: ok, SEEK: ok, WATCH: ok })).toThrow(/STAY/)
    expect(() => parseTierCopy({ RUN: ok, SEEK: ok, WATCH: ok, STAY: { ...ok, slogan: '  ' } })).toThrow(/STAY\.slogan/)
    expect(() => parseTierCopy({ RUN: ok, SEEK: ok, WATCH: ok, STAY: ok, EXTRA: ok })).toThrow()
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/tier-copy.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现 `apps/server/src/tiers/tier-copy.ts`**

路径用 `import.meta.url` 解析：`src/tiers/` 和 `dist/tiers/` 往上两级都是 `apps/server/`，源码和产物共用同一个相对路径。

```ts
// apps/server/src/tiers/tier-copy.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { Tier, TierCopy } from '@should-quit/shared'

export const DEFAULT_TIERS_PATH = fileURLToPath(new URL('../../config/tiers.json', import.meta.url))

/** Nest 注入令牌 */
export const TIER_COPY = Symbol('TIER_COPY')
export type TierCopyMap = Record<Tier, TierCopy>

const text = z.string().trim().min(1, '不能为空')
const copy = z.strictObject({ label: text, slogan: text, guidance: text })
const schema = z.strictObject({ RUN: copy, SEEK: copy, WATCH: copy, STAY: copy })

export function parseTierCopy(raw: unknown): TierCopyMap {
  const r = schema.safeParse(raw)
  if (!r.success) {
    const lines = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`tiers.json 校验失败：\n${lines.join('\n')}`)
  }
  return r.data
}

export function loadTierCopy(path: string = DEFAULT_TIERS_PATH): TierCopyMap {
  return parseTierCopy(JSON.parse(readFileSync(path, 'utf8')))
}
```

缺档位时 zod 的 issue path 是 `['STAY']`，字段为空时是 `['STAY', 'slogan']`，所以测试里的正则能匹配到。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @should-quit/server exec vitest run test/tier-copy.test.ts`
Expected: PASS，2 个用例。

- [ ] **Step 6: 实现 `apps/server/src/prisma/prisma.service.ts` 与 `src/prisma/errors.ts`**

```ts
// apps/server/src/prisma/prisma.service.ts
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.js'
import { ENV, type Env } from '../env.js'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    // 适配器直接接收 mysql:// 连接串（Task 2 已核实）
    super({ adapter: new PrismaMariaDb(env.DATABASE_URL) })
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
```

```ts
// apps/server/src/prisma/errors.ts
/** Prisma 已知错误码判断，例如 P2002 唯一约束冲突 */
export function hasPrismaCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code
}
```

不在构造时 `$connect()`：Prisma 首次查询时自动连接，应用启动不会因为数据库暂时不可用而失败。

- [ ] **Step 7: 实现 `apps/server/src/core.module.ts`**

全局模块，业务模块直接注入 `ENV`、`Clock`、`TIER_COPY`、`PrismaService`，不用各自 import。

```ts
// apps/server/src/core.module.ts
import { Global, Module } from '@nestjs/common'
import { Clock, SystemClock } from './clock.js'
import { ENV, loadEnv } from './env.js'
import { PrismaService } from './prisma/prisma.service.js'
import { TIER_COPY, loadTierCopy } from './tiers/tier-copy.js'

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: Clock, useClass: SystemClock },
    { provide: TIER_COPY, useFactory: () => loadTierCopy() },
    PrismaService,
  ],
  exports: [ENV, Clock, TIER_COPY, PrismaService],
})
export class CoreModule {}
```

`ENV`、`TIER_COPY` 用 `useFactory`，校验失败会在 Nest 启动阶段抛错，满足设计文档“配置不合法则启动失败”。

- [ ] **Step 8: 类型检查并提交**

Run: `pnpm --filter @should-quit/server typecheck`
Expected: 无报错。

```bash
git add apps/server/config/tiers.json apps/server/src/tiers apps/server/src/prisma apps/server/src/core.module.ts apps/server/test/tier-copy.test.ts
git commit -m "feat(server): add tier copy config, prisma service and core module"
```

---

### Task 5：业务错误、全局异常过滤器与 zod 管道

**Files:**
- Create: `apps/server/src/common/app-error.ts`、`src/common/error.filter.ts`、`src/common/zod.pipe.ts`
- Test: `apps/server/test/error-filter.test.ts`

所有错误响应统一为 `{code, message}`。三类来源：业务代码抛的 `AppError`；Nest 自带的 `HttpException`（如路由不存在 404）；其他未预期异常，一律 `500 INTERNAL_ERROR`，不暴露堆栈和内部信息。

- [ ] **Step 1: 写失败测试 `apps/server/test/error-filter.test.ts`**

用一个只含测试控制器的最小 Nest 应用验证过滤器和管道，不依赖数据库。

```ts
import { Body, Controller, Get, Module, Post, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError } from '../src/common/app-error.js'
import { ErrorFilter } from '../src/common/error.filter.js'
import { ZodPipe } from '../src/common/zod.pipe.js'

const bodySchema = z.object({ n: z.number().int() })

@Controller('t')
class TestController {
  @Get('app') app(): never { throw new AppError('BASELINE_REQUIRED', '请先完成基准录入') }
  @Get('boom') boom(): never { throw new Error('db password=secret leaked') }
  @Post('zod') zod(@Body(new ZodPipe(bodySchema)) b: { n: number }): { n: number } { return b }
}

@Module({ controllers: [TestController] })
class TestModule {}

describe('ErrorFilter / ZodPipe', () => {
  let app: INestApplication
  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [TestModule] }).compile()
    app = ref.createNestApplication({ logger: false })
    app.useGlobalFilters(new ErrorFilter())
    await app.init()
  })
  afterAll(() => app.close())

  it('AppError → 对照表中的状态码与 {code, message}', async () => {
    const r = await request(app.getHttpServer()).get('/t/app')
    expect(r.status).toBe(409)
    expect(r.body).toEqual({ code: 'BASELINE_REQUIRED', message: '请先完成基准录入' })
  })
  it('未预期异常 → 500 INTERNAL_ERROR，不泄露原始信息', async () => {
    const r = await request(app.getHttpServer()).get('/t/boom')
    expect(r.status).toBe(500)
    expect(r.body.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(r.body)).not.toContain('secret')
  })
  it('路由不存在 → 404 NOT_FOUND', async () => {
    const r = await request(app.getHttpServer()).get('/nope')
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('NOT_FOUND')
  })
  it('zod 校验失败 → 400 VALIDATION_FAILED，message 带字段路径', async () => {
    const r = await request(app.getHttpServer()).post('/t/zod').send({ n: 1.5 })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('VALIDATION_FAILED')
    expect(r.body.message).toMatch(/n/)
  })
  it('zod 校验通过时返回解析后的值', async () => {
    const r = await request(app.getHttpServer()).post('/t/zod').send({ n: 2 })
    expect(r.status).toBe(201)
    expect(r.body).toEqual({ n: 2 })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/error-filter.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/common/app-error.ts` 与 `src/common/zod.pipe.ts`**

```ts
// apps/server/src/common/app-error.ts
import { ErrorCode, errorHttpStatus } from '@should-quit/shared'

/** 业务错误：code 决定 HTTP 状态（见 shared errorHttpStatus） */
export class AppError extends Error {
  readonly status: number
  constructor(readonly code: ErrorCode, message: string) {
    super(message)
    // AGENT_UNAVAILABLE / AGENT_TIMEOUT 只走 SSE；若被误抛成 HTTP 异常，按 500 处理
    this.status = errorHttpStatus[code] ?? 500
  }
}
```

```ts
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
```

- [ ] **Step 4: 实现 `src/common/error.filter.ts`**

`HttpException` 的状态码映射到最接近的错误码；`ThrottlerException` 之类的 429 也能落到 `RATE_LIMITED`。未预期异常只记 `err.name` 和堆栈到日志，响应体固定文案。

```ts
// apps/server/src/common/error.filter.ts
import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import type { ErrorBody, ErrorCode } from '@should-quit/shared'
import { AppError } from './app-error.js'

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'AGENT_BUSY',
  429: 'RATE_LIMITED',
  503: 'AGENT_RESTARTING',
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter')

  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>()
    // SSE 已开始推流时不能再写 JSON；由 AgentService 自己发 error 事件（Phase 4）
    if (res.headersSent) return

    let status = 500
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: '服务开小差了，请稍后再试' }

    if (err instanceof AppError) {
      status = err.status
      body = { code: err.code, message: err.message }
    } else if (err instanceof HttpException) {
      status = err.getStatus()
      const code = STATUS_TO_CODE[status]
      if (code) body = { code, message: err.message }
    }

    if (status >= 500 && !(err instanceof AppError)) {
      this.logger.error(err instanceof Error ? (err.stack ?? err.name) : 'non-error thrown')
    }
    res.status(status).json(body)
  }
}
```

409 映射到 `AGENT_BUSY` 只是兜底：业务代码里的 409 全部用 `AppError` 抛出，带准确的 code。

- [ ] **Step 5: 运行确认通过并提交**

Run: `pnpm --filter @should-quit/server exec vitest run test/error-filter.test.ts`
Expected: PASS，5 个用例。

```bash
git add apps/server/src/common apps/server/test/error-filter.test.ts
git commit -m "feat(server): add app error, global error filter and zod pipe"
```

---

### Task 6：登录、JWT 与全局鉴权守卫

**Files:**
- Create: `apps/server/src/auth/wechat.client.ts`、`src/auth/auth.service.ts`、`src/auth/auth.controller.ts`、`src/auth/auth.guard.ts`、`src/auth/decorators.ts`、`src/auth/auth.module.ts`
- Test: `apps/server/test/auth.service.test.ts`

设计要点：
- `AUTH_MODE=mock`：openid = `mock_<code>`，不发任何外部请求。`AUTH_MODE=wechat`：调 `jscode2session`，失败抛 `WECHAT_LOGIN_FAILED`。
- 微信请求封装成可注入的 `WechatClient`，测试里替换成假实现，不触网。
- 全局守卫默认要求 JWT；`@Public()` 标记的路由放行。JWT 载荷只放 `sub`（userId），有效期 7 天。
- `@UserId()` 从 `req.user.sub` 取 userId，业务代码不直接碰 request。

- [ ] **Step 1: 写失败测试 `apps/server/test/auth.service.test.ts`**

```ts
import { JwtService } from '@nestjs/jwt'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthService } from '../src/auth/auth.service.js'
import type { WechatClient } from '../src/auth/wechat.client.js'
import { AppError } from '../src/common/app-error.js'
import { loadEnv } from '../src/env.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
const jwt = new JwtService({ secret: 'j'.repeat(32), signOptions: { expiresIn: '7d' } })
const fakeWechat: WechatClient = {
  async code2session(code) {
    if (code === 'bad') throw new AppError('WECHAT_LOGIN_FAILED', '微信登录失败')
    return { openid: `wx_${code}` }
  },
}

function service(mode: 'mock' | 'wechat'): AuthService {
  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: 'j'.repeat(32),
    INTERNAL_TOKEN: 'i'.repeat(32),
    AUTH_MODE: mode,
    WECHAT_APPID: 'wx1',
    WECHAT_SECRET: 's',
  })
  return new AuthService(env, prisma as never, jwt, fakeWechat)
}

describe('AuthService', () => {
  beforeEach(() => truncateAll(prisma))
  afterAll(() => prisma.$disconnect())

  it('mock：openid = mock_<code>，首次登录建用户，hasBaseline=false', async () => {
    const r = await service('mock').login('alice')
    const u = await prisma.user.findUniqueOrThrow({ where: { openid: 'mock_alice' } })
    expect(r.user.id).toBe(u.id)
    expect(r.hasBaseline).toBe(false)
    expect(jwt.verify<{ sub: string }>(r.token).sub).toBe(u.id)
  })
  it('同一 code 再次登录复用用户', async () => {
    const a = await service('mock').login('alice')
    const b = await service('mock').login('alice')
    expect(b.user.id).toBe(a.user.id)
    expect(await prisma.user.count()).toBe(1)
  })
  it('已录入基准时 hasBaseline=true', async () => {
    const { user } = await service('mock').login('bob')
    await prisma.baseline.create({
      data: { userId: user.id, salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 },
    })
    expect((await service('mock').login('bob')).hasBaseline).toBe(true)
  })
  it('wechat：用 code2session 返回的 openid', async () => {
    await service('wechat').login('c1')
    expect(await prisma.user.count({ where: { openid: 'wx_c1' } })).toBe(1)
  })
  it('wechat：code2session 失败抛 WECHAT_LOGIN_FAILED', async () => {
    await expect(service('wechat').login('bad')).rejects.toMatchObject({ code: 'WECHAT_LOGIN_FAILED' })
  })
})
```

`prisma as never`：测试用的 `PrismaClient` 和 `PrismaService` 结构相同，绕过 Nest 注入直接构造。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/auth.service.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/auth/wechat.client.ts`**

```ts
// apps/server/src/auth/wechat.client.ts
import { Inject, Injectable } from '@nestjs/common'
import { AppError } from '../common/app-error.js'
import { ENV, type Env } from '../env.js'

export abstract class WechatClient {
  abstract code2session(code: string): Promise<{ openid: string }>
}

@Injectable()
export class HttpWechatClient extends WechatClient {
  constructor(@Inject(ENV) private readonly env: Env) {
    super()
  }

  async code2session(code: string): Promise<{ openid: string }> {
    // URLSearchParams 负责转义，code 不直接拼进 URL
    const qs = new URLSearchParams({
      appid: this.env.WECHAT_APPID ?? '',
      secret: this.env.WECHAT_SECRET ?? '',
      js_code: code,
      grant_type: 'authorization_code',
    })
    let data: { openid?: string; errcode?: number }
    try {
      const res = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${qs}`, { signal: AbortSignal.timeout(5000) })
      data = (await res.json()) as typeof data
    } catch {
      throw new AppError('WECHAT_LOGIN_FAILED', '微信登录失败，请稍后再试')
    }
    // 不记录、不返回 session_key；MVP 用不到
    if (!data.openid || data.errcode) throw new AppError('WECHAT_LOGIN_FAILED', '微信登录失败，请重试')
    return { openid: data.openid }
  }
}
```

- [ ] **Step 4: 实现 `src/auth/auth.service.ts`**

```ts
// apps/server/src/auth/auth.service.ts
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { LoginResponse } from '@should-quit/shared'
import { ENV, type Env } from '../env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { WechatClient } from './wechat.client.js'

export interface JwtPayload { sub: string }

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wechat: WechatClient,
  ) {}

  async login(code: string): Promise<LoginResponse> {
    const openid = this.env.AUTH_MODE === 'mock' ? `mock_${code}` : (await this.wechat.code2session(code)).openid
    // upsert 处理并发首登；openid 有唯一索引
    const user = await this.prisma.user.upsert({ where: { openid }, create: { openid }, update: {} })
    const baseline = await this.prisma.baseline.findUnique({ where: { userId: user.id }, select: { userId: true } })
    const payload: JwtPayload = { sub: user.id }
    return {
      token: await this.jwt.signAsync(payload),
      user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl },
      hasBaseline: baseline !== null,
    }
  }
}
```

mock 模式的 `code` 已由 `loginSchema` 限制为 1–128 字符；openid 列是 `VarChar(64)`，所以 Step 6 的控制器对 mock 模式再加一层 ≤ 59 字符校验（`mock_` 占 5 个）。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @should-quit/server exec vitest run test/auth.service.test.ts`
Expected: PASS，5 个用例。

- [ ] **Step 6: 实现装饰器、守卫、控制器与模块**

```ts
// apps/server/src/auth/decorators.ts
import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common'

export const IS_PUBLIC = 'isPublic'
/** 跳过全局 JWT 守卫 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true)

/** 当前登录用户 id（由 AuthGuard 写入 req.user） */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<{ user: { sub: string } }>().user.sub
})
```

```ts
// apps/server/src/auth/auth.guard.ts
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { AppError } from '../common/app-error.js'
import type { JwtPayload } from './auth.service.js'
import { IS_PUBLIC } from './decorators.js'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>()
    const [scheme, token] = (req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw new AppError('UNAUTHORIZED', '请先登录')
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token)
      if (typeof payload.sub !== 'string') throw new Error('bad payload')
      req.user = { sub: payload.sub }
      return true
    } catch {
      throw new AppError('UNAUTHORIZED', '登录已过期，请重新登录')
    }
  }
}
```

```ts
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
```

```ts
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
```

`JwtModule` 设 `global: true`，Phase 4 的 internal 模块不用再注册一遍。`APP_GUARD` 在这里注册，所有模块的路由默认都要求登录。

- [ ] **Step 7: 类型检查并提交**

Run: `pnpm --filter @should-quit/server typecheck`
Expected: 无报错。守卫与控制器的 HTTP 行为在 Task 10 的 e2e 中覆盖。

```bash
git add apps/server/src/auth apps/server/test/auth.service.test.ts
git commit -m "feat(server): add mock/wechat login, jwt and global auth guard"
```

---

### Task 7：评分服务、快照与趋势

**Files:**
- Create: `apps/server/src/score/score.service.ts`、`src/score/score.controller.ts`、`src/score/score.module.ts`、`src/baseline/baseline-required.guard.ts`
- Test: `apps/server/test/score.service.test.ts`

`ScoreService` 是评分的唯一入口：
- `current(userId)`：读基准 + 近 30 天打卡，调用 shared 的 `aggregateDaily` → `computeScore`，附上档位文案。不读快照。
- `recordSnapshot(userId)`：算一次当前分，upsert 当天快照，返回 `ScoreView`。基准保存、打卡成功后调用。
- `trend(userId, range)`：范围内快照 + 范围起点前最近一条（`before`）。

`BaselineRequiredGuard` 放在 baseline 目录（职责属于基准），但评分控制器先用到，所以在本 Task 创建。

- [ ] **Step 1: 写失败测试 `apps/server/test/score.service.test.ts`**

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from '../src/clock.js'
import { toDbDate } from '../src/db-date.js'
import { ScoreService } from '../src/score/score.service.js'
import { loadTierCopy } from '../src/tiers/tier-copy.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
// 2026-10-31 12:00 北京时间
const clock = new FixedClock(new Date('2026-10-31T04:00:00Z'))
const svc = new ScoreService(prisma as never, clock, loadTierCopy())
const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 }

async function userWithBaseline(levels = ALL3): Promise<string> {
  const u = await prisma.user.create({ data: { openid: `mock_${Math.random()}` } })
  await prisma.baseline.create({ data: { userId: u.id, ...levels } })
  return u.id
}
async function checkin(userId: string, date: string, stars: number): Promise<void> {
  await prisma.moodCheckin.create({ data: { userId, stars, checkinDate: toDbDate(date) } })
}

describe('ScoreService', () => {
  beforeEach(async () => {
    await truncateAll(prisma)
    clock.set(new Date('2026-10-31T04:00:00Z'))
  })
  afterAll(() => prisma.$disconnect())

  it('没有基准时抛 BASELINE_REQUIRED', async () => {
    const u = await prisma.user.create({ data: { openid: 'mock_x' } })
    await expect(svc.current(u.id)).rejects.toMatchObject({ code: 'BASELINE_REQUIRED' })
  })
  it('没有打卡：moodScore 为 null，总分等于客观分，附带档位文案', async () => {
    const id = await userWithBaseline()
    const s = await svc.current(id)
    expect(s).toMatchObject({ objectiveScore: 50, moodScore: null, totalScore: 50, tier: 'SEEK', algoVersion: 1 })
    expect(s.copy.slogan).toBe('骑驴找马，悄悄看机会')
    expect(s.breakdown.salary).toBe(50)
  })
  it('有打卡：按 0.6/0.4 加权', async () => {
    const id = await userWithBaseline()
    await checkin(id, '2026-10-31', 5) // 心情 100
    expect((await svc.current(id)).totalScore).toBe(70) // 50*0.6 + 100*0.4
  })
  it('30 天窗口：距今 29 天计入，30 天不计入', async () => {
    const id = await userWithBaseline()
    await checkin(id, '2026-10-01', 5) // age 30，不计入
    expect((await svc.current(id)).moodScore).toBeNull()
    await checkin(id, '2026-10-02', 1) // age 29，计入
    expect((await svc.current(id)).moodScore).toBe(0)
  })
  it('只看自己的打卡', async () => {
    const a = await userWithBaseline()
    const b = await userWithBaseline()
    await checkin(b, '2026-10-31', 5)
    expect((await svc.current(a)).moodScore).toBeNull()
  })
  it('同一天多次 recordSnapshot 只保留一行，取最后一次', async () => {
    const id = await userWithBaseline()
    await svc.recordSnapshot(id)
    await checkin(id, '2026-10-31', 5)
    const s = await svc.recordSnapshot(id)
    const rows = await prisma.scoreSnapshot.findMany({ where: { userId: id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.totalScore).toBe(s.totalScore)
    expect(rows[0]!.totalScore).toBe(70)
  })
  it('趋势：返回范围内快照（升序）与范围起点前最近一条', async () => {
    const id = await userWithBaseline()
    clock.set(new Date('2026-10-20T04:00:00Z'))
    await svc.recordSnapshot(id) // 范围外
    clock.set(new Date('2026-10-28T04:00:00Z'))
    await svc.recordSnapshot(id)
    clock.set(new Date('2026-10-31T04:00:00Z'))
    await svc.recordSnapshot(id)
    const t = await svc.trend(id, '7d') // 2026-10-25 ~ 2026-10-31
    expect(t.before?.date).toBe('2026-10-20')
    expect(t.items.map((p) => p.date)).toEqual(['2026-10-28', '2026-10-31'])
    expect(t.items[0]).toMatchObject({ totalScore: 50, tier: 'SEEK', objectiveScore: 50, moodScore: null })
  })
  it('趋势：没有更早快照时 before 为 null', async () => {
    const id = await userWithBaseline()
    await svc.recordSnapshot(id)
    expect((await svc.trend(id, '30d')).before).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/score.service.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/score/score.service.ts`**

```ts
// apps/server/src/score/score.service.ts
import { Inject, Injectable } from '@nestjs/common'
import {
  MOOD_WINDOW_DAYS, TREND_RANGE_DAYS, aggregateDaily, computeScore, shiftDate,
  type BaselineInput, type ScoreView, type TrendPoint, type TrendRange, type TrendResponse,
} from '@should-quit/shared'
import { Clock } from '../clock.js'
import { AppError } from '../common/app-error.js'
import { fromDbDate, toDbDate } from '../db-date.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TIER_COPY, type TierCopyMap } from '../tiers/tier-copy.js'

@Injectable()
export class ScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(TIER_COPY) private readonly copy: TierCopyMap,
  ) {}

  async current(userId: string): Promise<ScoreView> {
    const today = this.clock.today()
    const baseline = await this.prisma.baseline.findUnique({ where: { userId } })
    if (!baseline) throw new AppError('BASELINE_REQUIRED', '请先完成工作基准录入')

    const since = shiftDate(today, -(MOOD_WINDOW_DAYS - 1))
    const rows = await this.prisma.moodCheckin.findMany({
      where: { userId, checkinDate: { gte: toDbDate(since), lte: toDbDate(today) } },
      select: { checkinDate: true, stars: true },
    })
    const daily = aggregateDaily(rows.map((r) => ({ checkinDate: fromDbDate(r.checkinDate), stars: r.stars })), today)
    const { userId: _u, updatedAt: _t, ...levels } = baseline
    const result = computeScore(levels as BaselineInput, daily)
    return { ...result, copy: this.copy[result.tier] }
  }

  async recordSnapshot(userId: string): Promise<ScoreView> {
    const view = await this.current(userId)
    const snapshotDate = toDbDate(this.clock.today())
    const data = {
      objectiveScore: view.objectiveScore,
      moodScore: view.moodScore,
      totalScore: view.totalScore,
      tier: view.tier,
      breakdown: view.breakdown,
      algoVersion: view.algoVersion,
    }
    // @@unique([userId, snapshotDate]) 保证同一天并发写入也只有一行
    await this.prisma.scoreSnapshot.upsert({
      where: { userId_snapshotDate: { userId, snapshotDate } },
      create: { userId, snapshotDate, ...data },
      update: data,
    })
    return view
  }

  async trend(userId: string, range: TrendRange): Promise<TrendResponse> {
    const start = toDbDate(shiftDate(this.clock.today(), -(TREND_RANGE_DAYS[range] - 1)))
    const [items, before] = await Promise.all([
      this.prisma.scoreSnapshot.findMany({ where: { userId, snapshotDate: { gte: start } }, orderBy: { snapshotDate: 'asc' } }),
      this.prisma.scoreSnapshot.findFirst({ where: { userId, snapshotDate: { lt: start } }, orderBy: { snapshotDate: 'desc' } }),
    ])
    return { before: before ? toPoint(before) : null, items: items.map(toPoint) }
  }
}

type SnapshotRow = {
  snapshotDate: Date
  totalScore: number
  tier: TrendPoint['tier']
  objectiveScore: { toNumber(): number }
  moodScore: { toNumber(): number } | null
}

function toPoint(s: SnapshotRow): TrendPoint {
  return {
    date: fromDbDate(s.snapshotDate),
    totalScore: s.totalScore,
    tier: s.tier,
    objectiveScore: s.objectiveScore.toNumber(),
    moodScore: s.moodScore === null ? null : s.moodScore.toNumber(),
  }
}
```

`SnapshotRow` 只描述用到的字段，`objectiveScore`/`moodScore` 是 Prisma 的 `Decimal`，用 `toNumber()` 转换。Prisma 的 `Tier` 枚举字符串与 shared 的 `Tier` 联合类型取值相同，可以直接赋值；如果类型检查报不兼容，在 `toPoint` 里加 `as TrendPoint['tier']`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/server exec vitest run test/score.service.test.ts`
Expected: PASS，8 个用例。

- [ ] **Step 5: 实现 `BaselineRequiredGuard`、控制器与模块**

```ts
// apps/server/src/baseline/baseline-required.guard.ts
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { AppError } from '../common/app-error.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** 未完成首次基准录入时返回 409 BASELINE_REQUIRED。必须在全局 AuthGuard 之后运行（Nest 先跑全局守卫） */
@Injectable()
export class BaselineRequiredGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const userId = ctx.switchToHttp().getRequest<{ user: { sub: string } }>().user.sub
    const hit = await this.prisma.baseline.findUnique({ where: { userId }, select: { userId: true } })
    if (!hit) throw new AppError('BASELINE_REQUIRED', '请先完成工作基准录入')
    return true
  }
}
```

```ts
// apps/server/src/score/score.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { trendQuerySchema, type ScoreView, type TrendRange, type TrendResponse } from '@should-quit/shared'
import { UserId } from '../auth/decorators.js'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { ScoreService } from './score.service.js'

@Controller('score')
@UseGuards(BaselineRequiredGuard)
export class ScoreController {
  constructor(private readonly score: ScoreService) {}

  @Get('current')
  current(@UserId() userId: string): Promise<ScoreView> {
    return this.score.current(userId)
  }

  @Get('trend')
  trend(@UserId() userId: string, @Query(new ZodPipe(trendQuerySchema)) q: { range: TrendRange }): Promise<TrendResponse> {
    return this.score.trend(userId, q.range)
  }
}
```

```ts
// apps/server/src/score/score.module.ts
import { Module } from '@nestjs/common'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { ScoreController } from './score.controller.js'
import { ScoreService } from './score.service.js'

@Module({
  controllers: [ScoreController],
  providers: [ScoreService, BaselineRequiredGuard],
  exports: [ScoreService, BaselineRequiredGuard],
})
export class ScoreModule {}
```

baseline、mood、agent 模块 `imports: [ScoreModule]` 后即可注入 `ScoreService` 并使用 `BaselineRequiredGuard`。

- [ ] **Step 6: 类型检查并提交**

Run: `pnpm --filter @should-quit/server typecheck`
Expected: 无报错。

```bash
git add apps/server/src/score apps/server/src/baseline/baseline-required.guard.ts apps/server/test/score.service.test.ts
git commit -m "feat(server): add score service with snapshots and trend"
```

---

### Task 8：基准读写

**Files:**
- Modify: `packages/shared/src/dto.ts`（追加 `BaselineResponse`）
- Create: `apps/server/src/baseline/baseline.service.ts`、`src/baseline/baseline.controller.ts`、`src/baseline/baseline.module.ts`
- Test: `apps/server/test/baseline.service.test.ts`

- `GET /api/baseline` 返回 `{ baseline: BaselineBody | null }`，不直接返回 `null`（见文件头调研结论）。
- `PUT /api/baseline` 整份覆盖：upsert 基准 → `recordSnapshot` → 返回 `ScoreView`。不挂 `BaselineRequiredGuard`，因为首次录入就走这个接口。

- [ ] **Step 1: shared 追加响应类型并重新构建**

在 `packages/shared/src/dto.ts` 响应类型区追加：

```ts
/** GET /api/baseline；未录入时 baseline 为 null */
export interface BaselineResponse { baseline: BaselineBody | null }
```

Run: `pnpm --filter @should-quit/shared build`
Expected: 构建成功。同时在 `00-overview.md` 第 4 节“响应类型”一行补上 `BaselineResponse`。

- [ ] **Step 2: 写失败测试 `apps/server/test/baseline.service.test.ts`**

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { BaselineService } from '../src/baseline/baseline.service.js'
import { FixedClock } from '../src/clock.js'
import { ScoreService } from '../src/score/score.service.js'
import { loadTierCopy } from '../src/tiers/tier-copy.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
const clock = new FixedClock(new Date('2026-10-31T04:00:00Z'))
const score = new ScoreService(prisma as never, clock, loadTierCopy())
const svc = new BaselineService(prisma as never, score)
const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 } as const
const ALL5 = { salary: 5, commute: 5, overtime: 5, restTime: 5, workload: 5, stabilityBenefits: 5, growth: 5, contentFit: 5 } as const

describe('BaselineService', () => {
  let userId: string
  beforeEach(async () => {
    await truncateAll(prisma)
    userId = (await prisma.user.create({ data: { openid: 'mock_b' } })).id
  })
  afterAll(() => prisma.$disconnect())

  it('未录入时返回 { baseline: null }', async () => {
    expect(await svc.get(userId)).toEqual({ baseline: null })
  })
  it('首次保存：写入基准、写当天快照、返回最新评分', async () => {
    const s = await svc.save(userId, ALL3)
    expect(s).toMatchObject({ objectiveScore: 50, totalScore: 50, tier: 'SEEK' })
    expect(await svc.get(userId)).toEqual({ baseline: ALL3 })
    expect(await prisma.scoreSnapshot.count({ where: { userId } })).toBe(1)
  })
  it('再次保存整份覆盖，当天快照更新而不是新增', async () => {
    await svc.save(userId, ALL3)
    const s = await svc.save(userId, ALL5)
    expect(s).toMatchObject({ objectiveScore: 100, totalScore: 100, tier: 'STAY' })
    expect(await svc.get(userId)).toEqual({ baseline: ALL5 })
    const rows = await prisma.scoreSnapshot.findMany({ where: { userId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.totalScore).toBe(100)
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/baseline.service.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现 `src/baseline/baseline.service.ts`**

```ts
// apps/server/src/baseline/baseline.service.ts
import { Injectable } from '@nestjs/common'
import { BASELINE_FIELDS, type BaselineBody, type BaselineResponse, type ScoreView } from '@should-quit/shared'
import { PrismaService } from '../prisma/prisma.service.js'
import { ScoreService } from '../score/score.service.js'

@Injectable()
export class BaselineService {
  constructor(private readonly prisma: PrismaService, private readonly score: ScoreService) {}

  async get(userId: string): Promise<BaselineResponse> {
    const row = await this.prisma.baseline.findUnique({ where: { userId } })
    if (!row) return { baseline: null }
    // 只挑 8 个业务字段，不把 userId / updatedAt 带给前端
    const baseline = Object.fromEntries(BASELINE_FIELDS.map((f) => [f, row[f]])) as BaselineBody
    return { baseline }
  }

  async save(userId: string, body: BaselineBody): Promise<ScoreView> {
    await this.prisma.baseline.upsert({ where: { userId }, create: { userId, ...body }, update: body })
    return this.score.recordSnapshot(userId)
  }
}
```

基准写入与快照写入不放进同一个事务：快照可由下一次操作重新 upsert，失败只影响趋势图上当天那个点，不影响当前分数（实时计算）。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @should-quit/server exec vitest run test/baseline.service.test.ts`
Expected: PASS，3 个用例。

- [ ] **Step 6: 实现控制器与模块**

```ts
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
```

```ts
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
```

- [ ] **Step 7: 类型检查并提交**

Run: `pnpm --filter @should-quit/server typecheck`
Expected: 无报错。

```bash
git add packages/shared/src/dto.ts docs/superpowers/plans/2026-10-31-should-quit-00-overview.md apps/server/src/baseline/baseline.service.ts apps/server/src/baseline/baseline.controller.ts apps/server/src/baseline/baseline.module.ts apps/server/test/baseline.service.test.ts
git commit -m "feat(server): add baseline read/write with snapshot refresh"
```

---

### Task 9：心情打卡

**Files:**
- Create: `apps/server/src/mood/mood.service.ts`、`src/mood/mood.controller.ts`、`src/mood/mood.module.ts`
- Test: `apps/server/test/mood.service.test.ts`

- `POST /api/moods`：`checkinDate` 由 `Clock.today()` 决定，不接收客户端时间；写入后 `recordSnapshot`，返回 `ScoreView`。
- `GET /api/moods/daily?days=N`：复用 shared 的 `aggregateDaily(rows, today, days)`，去掉 `age` 后返回 `MoodDailyItem[]`（升序）。
- `GET /api/moods?date=YYYY-MM-DD`：当天明细，按 `createdAt` 升序。小程序首页用 `date=今天` 拿“今日已打卡 N 次”的初始值。
- 三个接口都挂 `BaselineRequiredGuard`。打卡只追加，不提供修改和删除接口。

- [ ] **Step 1: 写失败测试 `apps/server/test/mood.service.test.ts`**

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from '../src/clock.js'
import { MoodService } from '../src/mood/mood.service.js'
import { ScoreService } from '../src/score/score.service.js'
import { loadTierCopy } from '../src/tiers/tier-copy.js'
import { createTestPrisma, truncateAll } from './setup/test-db.js'

const prisma = createTestPrisma()
const clock = new FixedClock(new Date('2026-10-31T04:00:00Z'))
const score = new ScoreService(prisma as never, clock, loadTierCopy())
const svc = new MoodService(prisma as never, clock, score)
const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 }

describe('MoodService', () => {
  let userId: string
  beforeEach(async () => {
    await truncateAll(prisma)
    clock.set(new Date('2026-10-31T04:00:00Z'))
    userId = (await prisma.user.create({ data: { openid: 'mock_m' } })).id
    await prisma.baseline.create({ data: { userId, ...ALL3 } })
  })
  afterAll(() => prisma.$disconnect())

  it('打卡后返回最新评分，并写当天快照', async () => {
    const s = await svc.create(userId, { stars: 5 })
    expect(s).toMatchObject({ moodScore: 100, totalScore: 70, tier: 'WATCH' })
    expect(await prisma.scoreSnapshot.count({ where: { userId } })).toBe(1)
  })
  it('checkinDate 按北京时间：23:59 与次日 00:01 归入两天', async () => {
    clock.set(new Date('2026-10-31T15:59:00Z'))
    await svc.create(userId, { stars: 3 })
    clock.set(new Date('2026-10-31T16:01:00Z'))
    await svc.create(userId, { stars: 3 })
    const daily = await svc.daily(userId, 30)
    expect(daily.map((d) => d.date)).toEqual(['2026-10-31', '2026-11-01'])
  })
  it('daily：同一天多次打卡合并为均值与次数，不含 age 字段', async () => {
    await svc.create(userId, { stars: 1 })
    await svc.create(userId, { stars: 2 })
    await svc.create(userId, { stars: 2 })
    expect(await svc.daily(userId, 30)).toEqual([{ date: '2026-10-31', avg: 16.67, count: 3 }])
  })
  it('daily：days 控制窗口', async () => {
    clock.set(new Date('2026-10-24T04:00:00Z'))
    await svc.create(userId, { stars: 3 }) // 距 10-31 为 7 天
    clock.set(new Date('2026-10-31T04:00:00Z'))
    expect(await svc.daily(userId, 7)).toEqual([])
    expect(await svc.daily(userId, 8)).toHaveLength(1)
  })
  it('byDate：当天明细按时间升序，备注原样保留（含 emoji）', async () => {
    await svc.create(userId, { stars: 2, note: '又加班🙃' })
    clock.set(new Date('2026-10-31T05:00:00Z'))
    await svc.create(userId, { stars: 4 })
    const items = await svc.byDate(userId, '2026-10-31')
    expect(items.map((i) => [i.stars, i.note])).toEqual([[2, '又加班🙃'], [4, null]])
    expect(typeof items[0]!.createdAt).toBe('string')
  })
  it('只看自己的数据', async () => {
    const other = (await prisma.user.create({ data: { openid: 'mock_o' } })).id
    await prisma.baseline.create({ data: { userId: other, ...ALL3 } })
    await svc.create(other, { stars: 5 })
    expect(await svc.daily(userId, 30)).toEqual([])
    expect(await svc.byDate(userId, '2026-10-31')).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @should-quit/server exec vitest run test/mood.service.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/mood/mood.service.ts`**

```ts
// apps/server/src/mood/mood.service.ts
import { Injectable } from '@nestjs/common'
import {
  aggregateDaily, shiftDate,
  type MoodCreateBody, type MoodDailyItem, type MoodItem, type ScoreView,
} from '@should-quit/shared'
import { Clock } from '../clock.js'
import { fromDbDate, toDbDate } from '../db-date.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ScoreService } from '../score/score.service.js'

@Injectable()
export class MoodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly score: ScoreService,
  ) {}

  async create(userId: string, body: MoodCreateBody): Promise<ScoreView> {
    await this.prisma.moodCheckin.create({
      data: {
        userId,
        stars: body.stars,
        note: body.note ?? null,
        checkinDate: toDbDate(this.clock.today()),
        createdAt: this.clock.now(),
      },
    })
    return this.score.recordSnapshot(userId)
  }

  async daily(userId: string, days: number): Promise<MoodDailyItem[]> {
    const today = this.clock.today()
    const rows = await this.prisma.moodCheckin.findMany({
      where: { userId, checkinDate: { gte: toDbDate(shiftDate(today, -(days - 1))), lte: toDbDate(today) } },
      select: { checkinDate: true, stars: true },
    })
    return aggregateDaily(rows.map((r) => ({ checkinDate: fromDbDate(r.checkinDate), stars: r.stars })), today, days)
      .map(({ date, avg, count }) => ({ date, avg, count }))
  }

  async byDate(userId: string, date: string): Promise<MoodItem[]> {
    const rows = await this.prisma.moodCheckin.findMany({
      where: { userId, checkinDate: toDbDate(date) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, stars: true, note: true, createdAt: true },
    })
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
  }
}
```

`createdAt` 显式写 `clock.now()`，测试里固定时钟时明细顺序可预期；生产中等同于数据库默认值。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @should-quit/server exec vitest run test/mood.service.test.ts`
Expected: PASS，6 个用例。

- [ ] **Step 5: 实现控制器与模块**

```ts
// apps/server/src/mood/mood.controller.ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import {
  dailyQuerySchema, moodCreateSchema, moodDateQuerySchema,
  type MoodCreateBody, type MoodDailyItem, type MoodItem, type ScoreView,
} from '@should-quit/shared'
import { UserId } from '../auth/decorators.js'
import { BaselineRequiredGuard } from '../baseline/baseline-required.guard.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { MoodService } from './mood.service.js'

@Controller('moods')
@UseGuards(BaselineRequiredGuard)
export class MoodController {
  constructor(private readonly mood: MoodService) {}

  @Post()
  create(@UserId() userId: string, @Body(new ZodPipe(moodCreateSchema)) body: MoodCreateBody): Promise<ScoreView> {
    return this.mood.create(userId, body)
  }

  @Get('daily')
  daily(@UserId() userId: string, @Query(new ZodPipe(dailyQuerySchema)) q: { days: number }): Promise<MoodDailyItem[]> {
    return this.mood.daily(userId, q.days)
  }

  @Get()
  byDate(@UserId() userId: string, @Query(new ZodPipe(moodDateQuerySchema)) q: { date: string }): Promise<MoodItem[]> {
    return this.mood.byDate(userId, q.date)
  }
}
```

`@Get('daily')` 写在 `@Get()` 之前，Express 按注册顺序匹配；两者路径不同，顺序不影响正确性，只是便于阅读。

```ts
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
```

导出 `MoodService`：Phase 4 的智能体工具 `get_mood_history` 复用 `daily()`。

- [ ] **Step 6: 类型检查并提交**

Run: `pnpm --filter @should-quit/server typecheck`
Expected: 无报错。

```bash
git add apps/server/src/mood apps/server/test/mood.service.test.ts
git commit -m "feat(server): add mood check-in, daily aggregation and day detail"
```

---

### Task 10：应用组装、启动入口与 e2e

**Files:**
- Create: `apps/server/src/app.module.ts`、`src/setup.ts`、`src/main.ts`
- Create: `apps/server/test/helpers.ts`
- Test: `apps/server/test/api.e2e.test.ts`

`setup.ts` 里的 `configureApp()` 由 `main.ts` 和测试共用，保证测试跑的是和生产一样的前缀、过滤器配置。

- [ ] **Step 1: 实现 `src/app.module.ts`**

日志只记方法、路径、状态码、耗时；`authorization` 头被脱敏，请求体（含备注）不进日志。测试环境日志级别为 `silent`。

```ts
// apps/server/src/app.module.ts
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
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : 'info',
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
```

Phase 4 会在 `imports` 里追加 `AgentModule`，internal 接口另起一个应用（见 Phase 4）。

- [ ] **Step 2: 实现 `src/setup.ts` 与 `src/main.ts`**

```ts
// apps/server/src/setup.ts
import type { INestApplication } from '@nestjs/common'
import { Logger } from 'nestjs-pino'
import { ErrorFilter } from './common/error.filter.js'

/** main.ts 与 e2e 测试共用的全局配置 */
export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger))
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new ErrorFilter())
  app.enableShutdownHooks()
}
```

```ts
// apps/server/src/main.ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { Server } from 'node:http'
import { AppModule } from './app.module.js'
import { ENV, type Env } from './env.js'
import { configureApp } from './setup.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  configureApp(app)
  const env = app.get<Env>(ENV)

  // 智能体单轮最长 300 秒（设计文档 §6.7）；Node 默认 requestTimeout 正好 300 秒，必须调大
  const server = app.getHttpServer() as Server
  server.requestTimeout = 330_000
  server.headersTimeout = 335_000
  server.keepAliveTimeout = 65_000

  await app.listen(env.PORT)
}

void bootstrap()
```

`headersTimeout` 必须大于 `keepAliveTimeout`，否则 Node 会提前断开复用中的连接。

- [ ] **Step 3: 写测试应用工厂 `apps/server/test/helpers.ts`**

```ts
// apps/server/test/helpers.ts
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { Clock, FixedClock } from '../src/clock.js'
import { configureApp } from '../src/setup.js'

export interface TestApp {
  app: INestApplication
  clock: FixedClock
  http: () => ReturnType<typeof request>
  close: () => Promise<void>
}

/** 默认时间：2026-10-31 12:00 北京时间 */
export async function createTestApp(at = new Date('2026-10-31T04:00:00Z')): Promise<TestApp> {
  const clock = new FixedClock(at)
  const ref = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock).useValue(clock)
    .compile()
  const app = ref.createNestApplication({ bufferLogs: true })
  configureApp(app)
  await app.init()
  return { app, clock, http: () => request(app.getHttpServer()), close: () => app.close() }
}

/** mock 登录，返回 Bearer 头 */
export async function loginAs(t: TestApp, code: string): Promise<{ authorization: string; userId: string }> {
  const r = await t.http().post('/api/auth/login').send({ code }).expect(200)
  return { authorization: `Bearer ${r.body.token as string}`, userId: r.body.user.id as string }
}

export const ALL3 = { salary: 3, commute: 3, overtime: 3, restTime: 3, workload: 3, stabilityBenefits: 3, growth: 3, contentFit: 3 }
```

vitest 运行时 `NODE_ENV` 默认为 `test`，`loadEnv` 读到后日志级别为 `silent`；`AUTH_MODE`、`DATABASE_URL` 来自 `vitest.config.ts` 的 `test.env`。

- [ ] **Step 4: 写 e2e 测试 `apps/server/test/api.e2e.test.ts`（主流程与鉴权）**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { truncateAll } from './setup/test-db.js'
import { ALL3, createTestApp, loginAs, type TestApp } from './helpers.js'

let t: TestApp

beforeAll(async () => { t = await createTestApp() })
afterAll(() => t.close())
beforeEach(async () => {
  await truncateAll(t.app.get(PrismaService))
  t.clock.set(new Date('2026-10-31T04:00:00Z'))
})

describe('主流程', () => {
  it('登录 → 409 → 录入基准 → 打卡 → 评分 → 趋势', async () => {
    const { authorization } = await loginAs(t, 'alice')

    const first = await t.http().post('/api/auth/login').send({ code: 'alice' }).expect(200)
    expect(first.body.hasBaseline).toBe(false)

    const blocked = await t.http().get('/api/score/current').set({ authorization }).expect(409)
    expect(blocked.body).toEqual({ code: 'BASELINE_REQUIRED', message: expect.any(String) })

    expect((await t.http().get('/api/baseline').set({ authorization }).expect(200)).body).toEqual({ baseline: null })

    const saved = await t.http().put('/api/baseline').set({ authorization }).send(ALL3).expect(200)
    expect(saved.body).toMatchObject({ totalScore: 50, tier: 'SEEK', moodScore: null })
    expect(saved.body.copy.slogan).toBe('骑驴找马，悄悄看机会')

    const mood = await t.http().post('/api/moods').set({ authorization }).send({ stars: 5, note: '摸鱼🐟' }).expect(201)
    expect(mood.body).toMatchObject({ totalScore: 70, moodScore: 100 })

    const today = await t.http().get('/api/moods').query({ date: '2026-10-31' }).set({ authorization }).expect(200)
    expect(today.body).toHaveLength(1)
    expect(today.body[0]).toMatchObject({ stars: 5, note: '摸鱼🐟' })

    const current = await t.http().get('/api/score/current').set({ authorization }).expect(200)
    expect(current.body.totalScore).toBe(70)

    const trend = await t.http().get('/api/score/trend').query({ range: '7d' }).set({ authorization }).expect(200)
    expect(trend.body).toEqual({ before: null, items: [expect.objectContaining({ date: '2026-10-31', totalScore: 70 })] })

    const relogin = await t.http().post('/api/auth/login').send({ code: 'alice' }).expect(200)
    expect(relogin.body.hasBaseline).toBe(true)
  })
})
```

- [ ] **Step 5: 在同一文件追加鉴权、隔离、时区与校验用例**

```ts
describe('鉴权与隔离', () => {
  it('缺少或伪造 token → 401 UNAUTHORIZED', async () => {
    const r1 = await t.http().get('/api/baseline').expect(401)
    expect(r1.body.code).toBe('UNAUTHORIZED')
    const r2 = await t.http().get('/api/baseline').set({ authorization: 'Bearer not-a-jwt' }).expect(401)
    expect(r2.body.code).toBe('UNAUTHORIZED')
  })
  it('A 的打卡不影响 B 的评分', async () => {
    const a = await loginAs(t, 'a')
    const b = await loginAs(t, 'b')
    for (const u of [a, b]) await t.http().put('/api/baseline').set({ authorization: u.authorization }).send(ALL3).expect(200)
    await t.http().post('/api/moods').set({ authorization: a.authorization }).send({ stars: 5 }).expect(201)
    const rb = await t.http().get('/api/score/current').set({ authorization: b.authorization }).expect(200)
    expect(rb.body.moodScore).toBeNull()
  })
})

describe('时区', () => {
  it('北京时间 23:59 与次日 00:01 的打卡归入不同两天', async () => {
    const { authorization } = await loginAs(t, 'tz')
    await t.http().put('/api/baseline').set({ authorization }).send(ALL3).expect(200)
    t.clock.set(new Date('2026-10-31T15:59:00Z'))
    await t.http().post('/api/moods').set({ authorization }).send({ stars: 1 }).expect(201)
    t.clock.set(new Date('2026-10-31T16:01:00Z'))
    await t.http().post('/api/moods').set({ authorization }).send({ stars: 5 }).expect(201)
    const daily = await t.http().get('/api/moods/daily').query({ days: 7 }).set({ authorization }).expect(200)
    expect(daily.body).toEqual([
      { date: '2026-10-31', avg: 0, count: 1 },
      { date: '2026-11-01', avg: 100, count: 1 },
    ])
  })
})

describe('参数校验', () => {
  it('非法基准、星级、日期、range → 400 VALIDATION_FAILED', async () => {
    const { authorization } = await loginAs(t, 'v')
    await t.http().put('/api/baseline').set({ authorization }).send({ ...ALL3, salary: 6 }).expect(400)
    await t.http().put('/api/baseline').set({ authorization }).send(ALL3).expect(200)
    const cases = [
      t.http().post('/api/moods').set({ authorization }).send({ stars: 0 }),
      t.http().post('/api/moods').set({ authorization }).send({ stars: 3, note: '字'.repeat(201) }),
      t.http().get('/api/moods').query({ date: '2026-02-30' }).set({ authorization }),
      t.http().get('/api/score/trend').query({ range: '1y' }).set({ authorization }),
    ]
    for (const r of await Promise.all(cases)) {
      expect(r.status).toBe(400)
      expect(r.body.code).toBe('VALIDATION_FAILED')
    }
  })
  it('mock 模式 code 超过 59 字符被拒绝', async () => {
    await t.http().post('/api/auth/login').send({ code: 'x'.repeat(60) }).expect(400)
  })
})
```

- [ ] **Step 6: 运行 e2e 确认通过**

Run: `pnpm --filter @should-quit/server exec vitest run test/api.e2e.test.ts`
Expected: PASS，6 个用例。

这一组测试面向已实现的模块做集成验证，所以没有单独的“先失败”步骤；如果某条失败，回到对应 Task 的服务或控制器排查，不要修改断言。

- [ ] **Step 7: 本地启动冒烟**

Run:
```bash
cd apps/server && pnpm build && pnpm start &
sleep 3
curl -s -X POST localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"code":"smoke"}'
kill %1
```
Expected: 返回 `{"token":"...","user":{...},"hasBaseline":false}`。启动失败时先看是否是 `.env` 里 `JWT_SECRET`/`INTERNAL_TOKEN` 不足 32 字符。

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/app.module.ts apps/server/src/setup.ts apps/server/src/main.ts apps/server/test/helpers.ts apps/server/test/api.e2e.test.ts
git commit -m "feat(server): assemble app module, bootstrap and e2e tests"
```

---

### Task 11：阶段收尾

- [ ] **Step 1: 全量检查**

Run: `pnpm -r build && pnpm -r test && pnpm -r typecheck`
Expected: shared、server 全部通过。

- [ ] **Step 2: 确认日志不含敏感内容**

Run: `cd apps/server && NODE_ENV=development pnpm start > /tmp/sq.log 2>&1 & sleep 3; curl -s -X POST localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"code":"logcheck"}' > /dev/null; kill %1; grep -cE 'Bearer|logcheck|JWT_SECRET' /tmp/sq.log; rm /tmp/sq.log`
Expected: 输出 `0`。请求体不进日志，所以 code 也不会出现。

Phase 3 完成的标志：对外业务接口全部可用，e2e 通过。Phase 4 在此基础上追加 `AgentModule` 与 internal 应用。

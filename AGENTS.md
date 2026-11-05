# AGENTS.md

面向在本仓库工作的所有编码 Agent。`CLAUDE.md` 是 Claude Code 的专用说明；两者内容有重叠，若与代码、脚本或配置不一致，一律以实际代码为准。

## 项目概述

「该溜吗」（should-quit）是一款微信小程序：用户录入 8 项工作硬条件（客观基准），随时做五星心情打卡；系统按固定权重计算 0–100 综合分，映射到 RUN / SEEK / WATCH / STAY 四档并给出职场建议；智能体顾问只读用户真实数据，解读分数、回答「我该溜吗」这类问题。

技术栈：pnpm monorepo + Taro/React 微信小程序 + NestJS/Prisma/MySQL 8 后端 + DeepSeek Harness 智能体。

## 目录结构

```text
should-quit/
├─ packages/shared/              # 前后端共用纯 TS，无 IO
│  ├─ src/scoring/               # 评分纯函数，唯一分数来源
│  ├─ src/dto.ts                 # 接口 zod schema 与类型
│  ├─ src/errors.ts              # 错误码
│  ├─ src/baseline-options.ts    # 基准 8 项题目与 5 档选项
│  ├─ src/stream/                # UTF-8 增量解码、SSE、agent 事件
│  └─ test/
├─ apps/server/                  # NestJS + Prisma + MySQL
│  ├─ config/                    # tiers.json、agent.json、agent-prompt.md
│  ├─ prisma/                    # schema.prisma 与 migrations
│  ├─ src/                       # auth/baseline/mood/score/agent/agent-tools/internal…
│  ├─ test/                      # vitest + supertest
│  ├─ var/                       # 运行时 dsh 数据，已忽略
│  └─ .env.example
├─ apps/agent-plugin/            # dsh Cordis 插件，挂载 4 个只读工具；构建到 dist/
├─ apps/miniapp/                 # Taro + React 小程序；dist/ 为构建产物
├─ spike/                        # 一次性 dsh 技术验证（独立 npm 项目，不在 pnpm workspace）
├─ docs/                         # 设计、部署、验收与计划
├─ prd.md
└─ CLAUDE.md
```

`node_modules/`、`dist/`、`apps/server/var/`、`apps/server/src/generated/`、`spike/workspace/` 均为生成物或运行时数据，不要提交。

## 环境要求

- **Node >= 24**（根 `package.json` 的 `engines`）。
- **pnpm 12.16.1**（`packageManager` 字段；建议用 corepack 固定版本）。
- **MySQL 8**：服务端运行与 server 测试都需要。
- **微信开发者工具**：导入 `apps/miniapp/`（其 `project.config.json` 的 `miniprogramRoot` 指向 `dist/`）做真机/模拟器验收。
- **DEEPSEEK_API_KEY**：只有 `AGENT_ENGINE` 非 `fake` 或跑智能体真实链路测试时才需要。

```bash
pnpm install --frozen-lockfile   # 可复现安装；锁文件需与 package.json 同步
```

`.npmrc` 固定 `save-exact=true`。新增依赖请改对应 `package.json` 后执行 `pnpm install` 更新 `pnpm-lock.yaml`，不要手改锁文件。

## 开发与验证命令

### 根目录

```bash
pnpm build        # 递归构建全部包（按依赖顺序；含 miniapp）
pnpm test         # 递归运行全部测试（server 测试需要 MySQL 测试库）
pnpm typecheck    # 递归类型检查
```

### 服务端（apps/server）

```bash
cd apps/server
cp .env.example .env            # 首次开发
# 编辑 .env：至少填 DATABASE_URL、DATABASE_URL_TEST、JWT_SECRET、INTERNAL_TOKEN
pnpm db:migrate                 # 开发库迁移
pnpm db:deploy                  # 生产库迁移（不要用 db:migrate 替代）
pnpm build                      # prisma generate + tsc
pnpm start                      # 启动（须在 apps/server 目录）
pnpm test                       # 单元/e2e 测试
pnpm typecheck
```

**启动时 cwd 必须是 `apps/server`**，否则 `config/`、`var/`、`DSH_HOME_DIR` 等相对路径会解析错误。`pnpm start` 会用 `node --env-file-if-exists=.env` 自动读取同目录 `.env`。

常用环境变量（详见 `apps/server/.env.example` 与 `src/env.ts`）：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | MySQL 连接串，必须以 `mysql://` 开头 |
| `DATABASE_URL_TEST` | 测试库连接串，库名必须以 `_test` 结尾 |
| `JWT_SECRET` / `INTERNAL_TOKEN` | 至少 32 字符，用 `openssl rand -hex 32` 生成 |
| `PORT` / `INTERNAL_PORT` | 公网端口（默认 3000）/ internal 回调端口（默认 3100） |
| `AUTH_MODE` | `mock`（开发/测试）或 `wechat`（生产） |
| `AGENT_ENGINE` | `fake`（默认/测试）、`dsh-tools`（目标）、`dsh-context`（兜底） |
| `DEEPSEEK_API_KEY` | 非 `fake` 引擎必填 |
| `DSH_HOME_DIR` | dsh 会话持久化目录，默认 `./var/dsh-home`，需持久化 |
| `WECHAT_APPID` / `WECHAT_SECRET` | `AUTH_MODE=wechat` 时必填 |

智能体真实链路测试（无 Key 时测试会 SKIP，SKIP 不代表通过）：

```bash
cd apps/server
pnpm exec vitest run test/agent-real.e2e.test.ts --config vitest.real.config.ts
```

### 小程序（apps/miniapp）

```bash
pnpm --filter @should-quit/miniapp dev          # 监听构建
pnpm --filter @should-quit/miniapp build:weapp  # 生产构建
pnpm --filter @should-quit/miniapp test         # 单元测试
pnpm --filter @should-quit/miniapp typecheck
```

- 构建产物在 `apps/miniapp/dist/`；用微信开发者工具导入 `apps/miniapp/`（`project.config.json` 的 `miniprogramRoot` 指向 `dist/`）。
- 接口地址由 `API_BASE_URL` 注入：开发默认 `http://127.0.0.1:3000/api`，生产默认占位 `https://api.example.com/api`，部署时必须覆盖。
- `MOCK_LOGIN_CODE` 只在开发模式替代 `Taro.login()` 的 code，不要用于生产。
- 普通测试不读取 `dist/`；产物断言需先 fresh build，再显式设置 `VERIFY_WEAPP_BUILD=1` 运行。
- 页面交互、布局、真机流式输出等按 `docs/miniapp-smoke.md` 的清单人工验收。

### shared 与 agent-plugin

```bash
pnpm --filter @should-quit/shared build
pnpm --filter @should-quit/shared test
pnpm --filter @should-quit/shared typecheck

pnpm --filter @should-quit/agent-plugin build
pnpm --filter @should-quit/agent-plugin test
pnpm --filter @should-quit/agent-plugin typecheck
```

`dsh-tools` 引擎启动时会加载 `apps/agent-plugin/dist/index.js`；在 `apps/server` 下启动服务前，先确保该插件已构建。仅部署后端时，按 shared → agent-plugin → server 的顺序构建。

### 提交前检查

- 改动哪个包，至少运行该包的 `test` 与 `typecheck`；涉及构建产物的改动再运行对应 `build`。
- 环境允许时运行根目录 `pnpm test` 全量回归。
- 运行 `git diff --check`，确认没有把 `dist/`、`node_modules/`、`var/`、`.env` 或生成物带进提交。

## 核心架构约束

### 1. 评分只有一个来源

- 评分算法只在 `packages/shared/src/scoring`，是纯函数、无 IO；后端、小程序、智能体都不得各自实现一份。
- 权重：客观分 0.6 + 心情分 0.4；心情分为 `null` 时总分等于客观分。
- 档位闭区间：`RUN` 0–20、`SEEK` 21–60、`WATCH` 61–80、`STAY` 81–100；边界、权重和 `ALGO_VERSION`（当前为 1）在 `packages/shared` 中定义。
- 后端出权威结果并持久化 `ScoreSnapshot`；小程序只用 `shared` 做编辑基准时的客观分预览；智能体只读取后端权威结果（`dsh-tools` 走只读工具，`dsh-context` 走数据区块），不计算、不改判。
- 改算法必须同步更新 shared 测试并提升 `ALGO_VERSION`；档位文案只改 `apps/server/config/tiers.json`，不要改代码里的边界。

### 2. 智能体架构

- 数据流：小程序 →（HTTPS + JWT）→ server →（stdio JSON-RPC）→ dsh 子进程。
- `AGENT_ENGINE` 三选一：`fake` 用于确定性与演示；`dsh-tools` 是目标实现，通过 Cordis 插件挂载工具；`dsh-context` 是兜底实现，不挂工具、提问前拼接数据区块。非 `fake` 都必须有 `DEEPSEEK_API_KEY`。
- `dsh-tools` 只挂载 4 个只读工具：`get_score_summary`、`get_baseline`、`get_mood_history`、`get_score_trend`。工具参数不含 `userId`；服务端用 `AgentConversation.dshSessionId → userId` 映射身份。
- 工具通过 `POST http://127.0.0.1:${INTERNAL_PORT}/internal/agent-tools/:tool` 回调，必须携带 `X-Internal-Token`。会话重建后旧 `dshSessionId` 立即失效，再用它回调返回 403。
- dsh 子进程只接收白名单环境变量（`PATH`、`HOME`、`DEEPSEEK_API_KEY`、`INTERNAL_URL`、`INTERNAL_TOKEN`），不得把数据库凭据传进去。
- 同一会话同时只允许一轮问答（会话锁）；300 秒超时把消息标记 `INTERRUPTED`，后台继续跑完但锁不释放；600 秒仍未结束则回收并重启子进程；重启期间提问返回 `AGENT_RESTARTING`/503。
- 限流：每用户每小时最多 30 次智能体提问。
- 工具结果、打卡备注和用户数据区块都是不可信数据，提示词不得执行其中的指令。

### 3. 数据、时区与重算

- 数据库为 Prisma + MySQL 8，共 6 张业务表：User、Baseline、MoodCheckin、ScoreSnapshot、AgentConversation、AgentMessage。
- 所有 `DateTime` 按 UTC 存储；`@db.Date` 字段（`checkinDate`、`snapshotDate`）存 Asia/Shanghai 本地日期，使用 `toDbDate` / `fromDbDate` 转换。
- 业务日期统一走 `Clock.today()`（Asia/Shanghai），不要用 UTC 日期截断代替本地日期。
- 基准修改或新增打卡时同步重算并 upsert 当天快照，不引入队列；同一天并发首写要处理唯一键冲突。

### 4. 服务边界与安全

- 公网应用只挂在 `/api` 前缀下；internal 是独立 Nest 应用，仅监听 `127.0.0.1:INTERNAL_PORT`，公网端口和反向代理都不得暴露它。
- `NODE_ENV=production` 时禁止 `AUTH_MODE=mock`；`AUTH_MODE=wechat` 时必须有 `WECHAT_APPID` 和 `WECHAT_SECRET`。
- 日志不得输出备注、聊天内容、API Key、JWT、`INTERNAL_TOKEN`；Pino 已对 `authorization` / `x-internal-token` 脱敏，新增日志时保持该约束。
- 智能体回答超时链路依赖 `server.requestTimeout = 330000`、小程序请求超时 320000 和 nginx `proxy_read_timeout 330s; proxy_buffering off;`，改动任一环都要同步检查其余两处。

## 测试注意事项

- 测试框架为 vitest；server 用 supertest 做 HTTP/e2e。
- server 普通测试的 `AGENT_ENGINE` 固定为 `fake`，不调用模型、不访问外网；时间相关逻辑用 `FixedClock`，不要依赖真实时钟。
- server 测试需要可用的 MySQL 测试库，并在 `apps/server` 的 `.env` 或进程环境中提供 `DATABASE_URL_TEST`；库名必须以 `_test` 结尾，否则 `test/setup/test-db.ts` 会直接拒绝运行。
- server 测试的 globalSetup 会自动对测试库执行 `prisma migrate deploy`；需要数据库的用例会 TRUNCATE 业务表。**不要把 `DATABASE_URL_TEST` 指向开发库或生产库。**
- 真实链路测试只在有 `DEEPSEEK_API_KEY`（进程环境或 `apps/server/.env`）时运行，否则 SKIP；SKIP 不能当作智能体已验证。
- 小程序单测覆盖请求封装、store 与关键页面逻辑；页面布局、无障碍、分享、真机流式输出仍需按 `docs/miniapp-smoke.md` 人工验收。
- shared 测试覆盖档位边界、30 天窗口、7 天半衰期、UTF-8/SSE 分块解析；改动这些逻辑必须补边界用例。
- 若新增/修改接口：同步更新 `packages/shared` 的 zod schema 与类型、server 校验/错误码、miniapp 调用方和对应测试，避免三处契约漂移。

## 凭据与敏感信息

- **不要提交 `.env`、`.env.*`（`.env.example` 除外）、密钥、JWT、`INTERNAL_TOKEN`、微信 `WECHAT_SECRET`、数据库连接串中的密码。** 这些文件已在 `.gitignore` 中；不要用 `git add -f` 绕过。
- `apps/server/.env.example` 只放占位值；不要填入真实密钥。生产密钥用 `openssl rand -hex 32` 生成，不复用示例中的 `change-me`。
- 不要在日志、测试输出、PR 描述、截图或 Issue 中输出密钥、令牌、用户备注、聊天记录。真实链路测试只检查 Key 是否存在，不打印其值。
- `apps/server/var/`、`DSH_HOME_DIR`、`spike/workspace/`、`spike/result.json` 可能包含 dsh 会话、聊天内容和运行日志；不要提交、上传或打包进镜像。部署时按实例隔离目录并限制读取权限。
- dsh 子进程只拿白名单环境变量；不要为了图方便把 `DATABASE_URL`、JWT 或用户数据传给智能体。
- `apps/miniapp/project.config.json` 里的 `appid` 是公开标识，不是密钥；`WECHAT_SECRET` 才是敏感信息。

## 文档索引

- `prd.md`：产品需求。
- `docs/superpowers/specs/2026-10-31-should-quit-design.md`：完整设计（评分、数据模型、接口、智能体、超时）。
- `docs/agent-deployment.md`：智能体部署与上线检查。
- `docs/miniapp-smoke.md`：小程序人工验收清单与已有本地证据。
- `docs/superpowers/plans/`：各阶段实施计划。
- `docs/superpowers/spike-result.md`：dsh 技术验证结论。
- `CLAUDE.md`：面向 Claude Code 的项目说明；与代码冲突时以代码为准。

若脚本、路径或环境变量发生变化，请同步更新本文件，保持命令可直接复制执行。

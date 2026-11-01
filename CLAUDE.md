# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「该溜吗」(should-quit) 是一款职场情绪记录与智能体辅助决策的微信小程序。用户录入工作硬条件（客观基准）并随时做心情打卡（主观感受），系统按固定权重计算 0-100 综合分，映射到四个档位并给出职场建议。智能体顾问读取用户真实数据，解读分数并回答「我该溜吗」这类问题。

技术栈：pnpm monorepo + Taro/React 小程序 + NestJS/Prisma/MySQL 后端 + DeepSeek Harness 智能体

**要求：Node >=24，pnpm@12.16.1**

## Monorepo 结构

```
should-quit/
├─ packages/shared/          # 前后端共用纯 TS 代码（无 IO）
│   ├─ scoring/              # 评分引擎（纯函数，唯一分数来源）
│   ├─ dto.ts                # 接口 zod schema 与类型
│   ├─ errors.ts             # 错误码枚举
│   ├─ baseline-options.ts   # 基准 8 项题目与 5 档选项
│   └─ stream/               # UTF-8 增量解码器 + SSE 帧解析器
├─ apps/server/              # NestJS + Prisma + MySQL
│   ├─ config/               # 档位文案、智能体提示词、结构化配置
│   ├─ prisma/               # 数据库 schema 与 migrations
│   ├─ src/
│   │   ├─ auth/             # JWT 登录（mock/wechat 模式）
│   │   ├─ baseline/         # 工作基准信息管理
│   │   ├─ mood/             # 心情打卡
│   │   ├─ score/            # 评分与趋势
│   │   ├─ agent/            # 智能体会话与消息（SSE 流式输出）
│   │   ├─ agent-tools/      # 智能体工具实现
│   │   └─ internal/         # dsh 工具回调端点（仅 127.0.0.1）
│   └─ var/                  # 运行时数据（dsh-home、日志等）
├─ apps/agent-plugin/        # dsh Cordis 插件（4 个只读工具）
└─ apps/miniapp/             # Taro + React 微信小程序
    ├─ src/
    │   ├─ pages/            # 页面（首页、趋势、顾问、我的）
    │   ├─ components/       # 组件（趋势图用 Canvas 2D 自绘）
    │   ├─ services/         # API 请求封装
    │   └─ stores/           # zustand 状态管理
    └─ config/               # Taro 配置
```

## 常用命令

### 根目录（递归执行）

```bash
pnpm install              # 安装依赖（--frozen-lockfile 用于 CI）
pnpm build                # 构建所有包（按依赖顺序）
pnpm test                 # 运行所有测试
pnpm typecheck            # 类型检查
```

### 服务端 (apps/server)

**重要：启动时 cwd 必须是 `apps/server`，以正确解析 config/ 和 var/ 相对路径**

```bash
# 开发
cd apps/server
pnpm db:migrate           # 开发环境数据库迁移
pnpm build                # 构建（包含 prisma generate）
pnpm start                # 启动服务（需先设置 .env）
pnpm test                 # 单元测试（使用 should_quit_test 库）
pnpm typecheck            # 类型检查

# 生产部署
pnpm db:deploy            # 生产环境数据库迁移

# 智能体真实链路测试（需要 DEEPSEEK_API_KEY）
pnpm exec vitest run test/agent-real.e2e.test.ts --config vitest.real.config.ts
```

**环境变量**（参考 `apps/server/.env.example`）：
- `DATABASE_URL` - MySQL 连接字符串
- `JWT_SECRET`, `INTERNAL_TOKEN` - 使用 `openssl rand -hex 32` 生成
- `INTERNAL_PORT` - internal 端点端口（仅监听 127.0.0.1，默认 3100）
- `AUTH_MODE` - `mock`（开发）或 `wechat`（生产）
- `AGENT_ENGINE` - `dsh-tools`（目标）, `dsh-context`（兜底）, `fake`（测试）
- `DEEPSEEK_API_KEY` - DeepSeek API 密钥
- `DSH_HOME_DIR` - dsh 会话持久化目录（默认 `./var/dsh-home`）

### 小程序 (apps/miniapp)

```bash
pnpm --filter @should-quit/miniapp dev        # 开发模式（监听文件变化）
pnpm --filter @should-quit/miniapp build:weapp  # 构建微信小程序
pnpm --filter @should-quit/miniapp test       # 运行测试
```

构建产物在 `apps/miniapp/dist/`，使用微信开发者工具打开该目录进行调试和预览。

### Shared 包 (packages/shared)

```bash
pnpm --filter @should-quit/shared build       # 构建（其他包依赖它）
pnpm --filter @should-quit/shared test        # 测试评分引擎、解析器等
```

### 智能体插件 (apps/agent-plugin)

```bash
pnpm --filter @should-quit/agent-plugin build  # 构建插件（server 依赖它）
```

## 核心架构原则

### 1. 评分算法的唯一性

**评分只有一个来源**：`packages/shared/scoring`。
- 后端出权威结果并持久化快照
- 小程序只用它做编辑基准时的实时预览
- 智能体**不算分**，只通过工具读取后端结果并解读

算法版本由 `ALGO_VERSION` 管理（当前为 1）。档位边界和权重在代码中定义，档位文案在 `apps/server/config/tiers.json` 中配置。

### 2. 智能体架构

**数据流**：小程序 →（HTTPS + JWT）→ server →（stdio JSON-RPC）→ dsh 子进程

- 后端持有一个常驻 dsh 子进程
- dsh 内的工具通过 HTTP 回调 `127.0.0.1:${INTERNAL_PORT}/internal/agent-tools/:tool`，携带共享密钥（`INTERNAL_TOKEN`）
- **工具全部只读**：`get_score_summary`, `get_baseline`, `get_mood_history`, `get_score_trend`
- 工具参数不含 userId，由服务端从 `dshSessionId` 映射得到

**两种实现**（由 `AGENT_ENGINE` 选择）：
- `dsh-tools`：通过 Cordis 插件挂载工具，子进程隔离数据
- `dsh-context`：不挂载工具，每次提问前拼接数据区块
- `fake`：用于确定性测试和演示

**会话锁机制**：同一会话同时只能有一轮问答在执行，避免上下文交错。超时 300 秒标记 `INTERRUPTED`，但后台继续跑完（600 秒仍未完成则回收进程）。

### 3. 数据模型与时区

**数据库**：Prisma + MySQL 8，6 张表（User, Baseline, MoodCheckin, ScoreSnapshot, AgentConversation, AgentMessage）

**时区约定**：
- 所有 `DateTime` 按 UTC 存储
- `@db.Date` 字段（`checkinDate`, `snapshotDate`）存储 Asia/Shanghai 本地日期
- 日均分、快照等聚合逻辑按本地日期计算

**重算时机**：基准修改或新增打卡时同步重算并 upsert 当天快照（不引入队列）。

### 4. 安全与隔离

- **internal 端口仅监听 `127.0.0.1`**，公网端口不提供 `/internal` 路由
- 工具回调必须携带 `X-Internal-Token`，sessionId 必须有效且属于当前用户
- 会话重建后，旧 `dshSessionId` 立即失效，再次回调返回 403
- 限流：每用户每小时 30 次智能体提问
- 日志不记录备注、聊天内容、API Key、JWT

## 部署注意事项

1. **构建顺序**：shared → agent-plugin → server（按依赖关系）
2. **启动目录**：必须 `cd apps/server && pnpm start`，确保相对路径正确
3. **数据库迁移**：生产用 `db:deploy`，开发用 `db:migrate`
4. **dsh 持久化**：`DSH_HOME_DIR` 需持久化，按实例隔离并限制权限
5. **反向代理**（nginx SSE 配置）：
   ```nginx
   proxy_read_timeout 330s;
   proxy_buffering off;
   ```
6. **验证**：上线前确认 internal 端口从外部不可达，且公网 `/internal` 返回 404

## 测试策略

- **shared**：评分边界、时间窗口、衰减权重、UTF-8/SSE 解析器
- **server**：主流程、安全（跨用户访问、限流、会话锁）、时区、SSE 事件顺序
- **智能体真实链路**：需设置 `DEEPSEEK_API_KEY`，验证工具调用和回答一致性
- **小程序**：请求封装和状态管理写单测，页面层按冒烟清单手动验证

普通测试不调用模型，通过 `FakeAgentEngine` 模拟。无 API Key 时真实测试会 SKIP。

## 文档参考

- `prd.md` - 产品需求文档
- `docs/superpowers/specs/2026-10-31-should-quit-design.md` - 完整设计文档
- `docs/agent-deployment.md` - 智能体部署指南
- `docs/superpowers/plans/` - 各阶段实施计划

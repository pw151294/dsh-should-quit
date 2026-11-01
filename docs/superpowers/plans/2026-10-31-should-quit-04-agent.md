# Phase 4：智能体模块

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付只读智能体顾问：会话管理、SSE 流式问答、会话锁 / 超时 / 卡死兜底、限流、internal 工具回调接口、dsh Cordis 插件，以及 `fake` / `dsh-tools` / `dsh-context` 三种引擎。

**Architecture:** `AgentService` 只依赖 `AgentEngine` 接口，负责全部公共逻辑（锁、限流、超时、心跳、落库、SSE 输出）。引擎只产出 `delta` / `tool` 事件或抛 `EngineError`。`DshRuntime` 持有常驻的 `DeepSeekHarness` 子进程，负责启动、退避重启、会话 resume / 重建。`dsh-tools` 模式下，插件里的工具通过 HTTP 回调 `127.0.0.1` 上的 internal 应用，由服务端把 dshSessionId 映射成 userId。

**Tech Stack:** NestJS 12.3.2、Prisma 7.10.1、`@deepseek-ai/dsh-sdk-client` 0.2.1-rc.5、vitest 5.0.5、supertest 7.3.1。

**前置：** Phase 1 的 `docs/superpowers/spike-result.md` 已提交；Phase 3 全部通过。先读 `00-overview.md` 第 3、4 节。

---

## 与设计文档的差异

| 设计文档 | 本计划 | 原因 |
|---|---|---|
| 限流用 `@nestjs/throttler` | 自写内存滑动窗口 `RateLimiter`（每用户每小时 30 次） | throttler 按路由和 IP 计数，按 userId 计数要自定义 tracker；单进程部署下 20 行代码更直接，也方便用小参数单测 |
| `delta` 逐字推送 | 按 step 推送（调研结论，见总览第 3 节）；拿不到通知时退回 `finalResponse` 整段推送 | SDK 协议没有 text-delta 通知 |
| 生成的 patch 为 YAML | 写 JSON 格式内容到 `.cordis.yml` | YAML 1.2 是 JSON 的超集，不用引入 YAML 序列化库 |

## 文件结构（路径相对 `apps/server/`，另注明的除外）

| 文件 | 职责 |
|---|---|
| `packages/shared/src/agent-tools.ts` | `AGENT_TOOL_NAMES`，server 与插件共用的工具名 |
| `config/agent-prompt.md`、`config/agent.json` | 系统提示模板；热线、工具状态文案、预设问题 |
| `src/agent/agent-config.ts` | 加载配置、注入 `{{hotline}}`、残留占位符时启动失败 |
| `src/agent/async-queue.ts`、`src/agent/rate-limiter.ts` | 回调转 AsyncIterable；滑动窗口限流 |
| `src/agent/engine.ts`、`src/agent/fake.engine.ts` | 引擎接口、`EngineError`、测试 / 本地用假引擎 |
| `src/agent/conversation.service.ts` | 会话创建、列表、归属校验、历史消息 |
| `src/agent/agent.service.ts` | 一轮问答的全部公共逻辑 |
| `src/agent/agent.controller.ts`、`src/agent/agent.module.ts` | HTTP / SSE 接口与模块组装 |
| `src/agent-tools/*` | 4 个只读工具的实现与 `dsh-context` 数据区块 |
| `src/internal/*` | internal 应用：token 守卫、工具回调控制器 |
| `src/agent/dsh/patch.ts`、`backoff.ts`、`map.ts` | 纯函数：patch 生成、退避、通知映射 |
| `src/agent/dsh/dsh-runtime.ts`、`dsh.engine.ts`、`engine.provider.ts` | 子进程生命周期、dsh 引擎、按 `AGENT_ENGINE` 选择实现 |
| `apps/agent-plugin/*` | Cordis 插件：注册 4 个工具，回调 internal 接口 |

<!-- P4-NEXT -->

# dsh 技术验证结果

- 时间：2026-11-01T02:49:42.262Z
- 平台：darwin-arm64；Node v25.6.1
- 结论：`AGENT_ENGINE=dsh-tools`

| # | 标准 | 结果 |
|---|---|---|
| 1 | 自定义 patch 启动，bash/文件系统工具已移除 | PASS |
| 2 | 自定义 Cordis 工具可被调用并拿到 sessionId | PASS |
| 3 | 同一进程两个会话并发提问都能完成 | PASS |
| 4 | 进程重启后 resumeSession 能接上之前的对话 | PASS |
| 5 | 本机 darwin 上子进程能正常启动 | PASS |

## 证据

### 1. 自定义 patch 启动，bash/文件系统工具已移除

- 模型自述可用工具：**Tools available to me:** `exit_plan_mode`, `spike_echo_session`  That's the complete list.  **Shell command:** I can't run `ls /` — I have no shell/execution tool in this session, so there's nothing to invoke.  **Reading /etc/hosts:** I can't read files either — I have no file-read tool. The works
- 实际 tool/call：（无）

### 2. 自定义 Cordis 工具可被调用并拿到 sessionId

- 会话 id：session-81fbf67ffdfb4c1198afb8494752a30d
- 回调记录的 sessionId：session-81fbf67ffdfb4c1198afb8494752a30d
- 期望校验码 SQ-03BD82；回答：The verification code is **SQ-03BD82**.

### 3. 同一进程两个会话并发提问都能完成

- A(session-7ab83f061a5a4db9ade6aaf90027c57a) 期望 SQ-80B19D：The verification code is **SQ-80B19D**.
- B(session-d9f6b5e089d64b028f3e3d69807212fa) 期望 SQ-2BE565：The verification code is **SQ-2BE565**.

### 4. 进程重启后 resumeSession 能接上之前的对话

- 会话 id：session-840762e18ad44cf5b12beaf6be7fee35；口令：PINEAPPLE-G39D9G
- resume 后回答：PINEAPPLE-G39D9G

### 5. 本机 darwin 上子进程能正常启动

- initialize 握手耗时 2423 ms

## 流式粒度（不参与判定）

- 观察 1：assistant/message 2 条，文本长度 0/39，间隔 ms 0/805
  - 其他通知：session.event:agent/inbox/spliced, session.status, session.event:turn/start, session.event:step/start, session.event:system/message, session.event:user/message, session.event:request/header, session.event:request/context, session.event:session/title, session.event:session-log-deepseek/delivery-accepted, session.event:tool/call, session.event:tool/result, session.event:step/end, session.event:turn/end

每个 step 结束才到一条 assistant/message，说明只能按 step 推送；Phase 4 的 `delta` 事件按 step 粒度发送。

## patch 警告（stderr）

- （无）

## 人工备注

- 异常：首轮运行时标准 2–4 失败，原因是 DeepSeek 账户欠费（402 Insufficient Balance），与 dsh 无关；充值后重跑 5 条全部 PASS。
- 流式粒度：逐 step 推送。带工具调用的一轮出现 2 条 assistant/message（工具调用 step 文本为空，最终 step 39 字），不存在逐字增量。Phase 4 的 `delta` 按 step 发送，跳过空文本。
- patch 行 id：`tool-bash`、`tool-pwsh`、`tool-jobs`、`tool-fs`、`tool-fs-search`、`tool-web`、`tool-subagent`、`tool-subagent-fork`、`tool-subagent-control`、`tool-subagent-list-agents`、`tool-workflow`、`tool-todo`、`tool-goal`、`tool-skill`、`tool-working-directory`，外加 `system-prompt` 覆盖。调试时 `request/header` 中下发给模型的工具列表只有 `exit_plan_mode` 与 `spike_echo_session`，说明嵌套行也已命中。Phase 4 直接沿用。
- 残留工具：`exit_plan_mode`（plan-mode 插件无条件注册，非 `tool-*` 行）。非 plan 模式下调用会抛错，无文件/shell 能力；Phase 4 可按需禁用 `plan-mode` 行。
- 插件依赖解析：patch 中 `./plugin/index.js` 相对路径加载可行，插件内 `import '@deepseek-ai/dsh-tools'` 能解析到与运行时同一份实例（npm 扁平安装，`npm ls` 仅一份）。
- env 白名单：`PATH`、`HOME`、`DEEPSEEK_API_KEY` 加业务变量（回调地址、token）即可启动，无需 `TMPDIR`/`USER`。
- sessionId：`exec.agent.id` 与 SDK `session.id` 一致，并发两会话互不串号。
- stderr 警告：SDK 未公开实时 stderr，本次未采集。

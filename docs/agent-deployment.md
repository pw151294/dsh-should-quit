# 智能体部署

需要 Node ≥24、MySQL8。从仓库根目录执行 `pnpm install --frozen-lockfile`，设置 server 环境 DATABASE_URL、JWT_SECRET、INTERNAL_TOKEN、INTERNAL_PORT、DEEPSEEK_API_KEY、DSH_HOME_DIR 与 AGENT_ENGINE。

Phase1 spike 选择 dsh-tools；也可显式选择 dsh-context。fake 用于确定性测试和演示。真实链路证据见 `.superpowers/sdd/2026-10-31-should-quit-04-agent/task-6-report.md`。

按顺序执行 `pnpm --filter @should-quit/shared build`、`pnpm --filter @should-quit/agent-plugin build`、`pnpm --filter @should-quit/server build`。启动时 cwd 必须是 `apps/server`，执行 `pnpm start`，使 config、插件构建产物和 var 相对路径正确解析。发布前执行数据库 migrate deploy。

internal 仅监听 `127.0.0.1:INTERNAL_PORT`，公网 PORT 不提供 internal 路由。反向代理仅代理公网端口；禁止代理 internal 端口。上线从外部验证 internal 端口不可达且公网 `/internal` 返回404。

nginx SSE location 保留：

```nginx
proxy_read_timeout 330s;
proxy_buffering off;
```

持久化 DSH_HOME_DIR，按应用实例隔离目录并限制读取权限；不要将开发机的 .env、密钥或聊天记录复制进镜像。重启后首次续聊恢复持久 session，失败时换 session 并注入最近10轮。300秒回答标记 INTERRUPTED，后台继续；600秒仍未完成回收进程。503期间等待退避恢复。shutdown 回收子进程。

日志仅记录身份、会话ID、错误码和耗时，不输出备注、问题、回答、Key 或 JWT。发布前执行 `pnpm -r test`、`pnpm -r typecheck` 与构建。普通测试不调用模型；有 Key 时单独执行 `pnpm --filter @should-quit/server exec vitest run test/agent-real.e2e.test.ts --config vitest.real.config.ts`。无 Key 的 SKIP 不代表真实验证成功。

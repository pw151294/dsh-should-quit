# 小程序验收记录

- 日期：2026-11-01（本地 Asia/Shanghai）
- 设备 / 微信版本 / 基础库：NOT EXECUTED；本轮仅本地 Node 自动化，无开发者工具/真机。
- Server commit / Miniapp commit：当前未提交工作树（Task 1–7）；无新增提交。
- AGENT_ENGINE / Spike报告：fake 自动化；真实两引擎测试因 DEEPSEEK_API_KEY EMPTY 跳过。仅检查存在性，不输出值。
- 合法HTTPS域名：NOT EXECUTED，未部署/未验证。

| 检查 | 预期 | 结果/证据 |
|---|---|---|
| 冷启动无token | 自动登录，按hasBaseline跳转 | NOT EXECUTED（需开发者工具/真机） |
| 直接访问分享入口 | 登录与基准门槛生效 | NOT EXECUTED（需开发者工具/真机） |
| 首次问卷 | 一屏一题，N/8，8项全部选后才能保存 | NOT EXECUTED（需开发者工具/真机） |
| 编辑 | 总览→单项→保存回总览 | NOT EXECUTED（需开发者工具/真机） |
| 首页 | 打卡区在上，分数卡在下，建议展开 | NOT EXECUTED（需开发者工具/真机） |
| 断网打卡 | 星级和备注保留 | NOT EXECUTED（需开发者工具/真机） |
| 北京时间午夜 | 今日次数刷新、不沿用昨天计数 | NOT EXECUTED（需开发者工具/真机） |
| 趋势7/30/90天 | Canvas四档背景与0/20/60/80/100刻度，文字摘要 | NOT EXECUTED（需开发者工具/真机） |
| 空趋势 | 不伪造0分或向前填分 | NOT EXECUTED（需开发者工具/真机） |
| 日历 | 月翻页、日期数字、四色与灰色、有效日期弹明细 | NOT EXECUTED（需开发者工具/真机） |
| 预设问题 | 新会话可点击立即发送 | NOT EXECUTED（需开发者工具/真机） |
| 真机分块中文 | 中文/emoji无乱码，工具灰行保留 | NOT EXECUTED（需开发者工具/真机） |
| 超时 | 保留部分回答，显示重试；后台未完仍busy | NOT EXECUTED（需开发者工具/真机） |
| 重试 | 新USER记录，旧失败回答仍在 | NOT EXECUTED（需开发者工具/真机） |
| 切页回聊天 | 读取历史，不自动重发POST | NOT EXECUTED（需开发者工具/真机） |
| 401并发 | 登录一次、每请求最多重试一次 | NOT EXECUTED（需开发者工具/真机） |
| 429/503 | 普通JSON提示，不按SSE解析 | NOT EXECUTED（需开发者工具/真机） |
| 无障碍 | 星级标签、文字档位、44px点击区、4.5:1对比度 | NOT EXECUTED（需开发者工具/真机） |
| 分享 | 标题为当前档位slogan | NOT EXECUTED（需开发者工具/真机） |

- [ ] pnpm -r test
- [ ] pnpm -r typecheck
- [ ] pnpm --filter @should-quit/miniapp build:weapp
- [ ] fake完整主流程
- [ ] Spike选定真实引擎主流程
- [ ] 真机流输出

## 本地自动化证据

最新检查：2026-11-01 13:16 +08:00（final fix）。

PASS 仅表示自动化范围，以上人工验收均未执行，不能据此宣称 fake 或真实引擎端到端真机通过。

- Workspace normal tests: shared 101 PASS；agent-plugin 2 PASS；server 99 PASS / 2 SKIP（无真实 Key）；miniapp 38 PASS / 2 SKIP（显式构建产物门禁）。共240 PASS、4 SKIP。
- Workspace typecheck / build: PASS（shared、agent-plugin、server、miniapp）。miniapp build 调用 taro build --type weapp。
- Fresh build 后 VERIFY_WEAPP_BUILD=1 miniapp test: 40 PASS，覆盖七页产物、趋势编译样式。
- request.test.ts、agent-stream.test.ts：自动登录/409、单次401刷新、JSON错误、中文分块、断线不重发等协议逻辑；不是微信网络栈验证。
- baseline-home.test.ts、trend.test.ts、chat.test.ts：问卷/打卡/趋势/聊天恢复与重试的本地逻辑；不是设备交互、布局、无障碍或分享实测。
- server agent.e2e.test.ts：12 PASS，fake HTTP/SSE、限流、超时/关停；完整server套件99 PASS。真实模式契约与进程测试不能替代真实Key联调。

执行顺序（仓库根目录）：

```sh
NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 -r test
NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 -r typecheck
NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 -r build
VERIFY_WEAPP_BUILD=1 NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 --filter @should-quit/miniapp test
```

普通测试不读取 dist；两个产物断言必须显式启用，且先 fresh build，避免旧产物伪通过。后续需导入 apps/miniapp/dist，配置真实 HTTPS 合法域名并逐行填写人工证据；Key 本地补齐后再执行两真实引擎测试，本轮不等待补齐。

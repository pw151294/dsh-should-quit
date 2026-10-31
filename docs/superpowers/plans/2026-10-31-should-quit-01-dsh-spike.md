# Phase 1：dsh 技术验证（Spike）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一个独立脚本验证设计文档 §6.5 的 5 条通过标准，结论写入 `docs/superpowers/spike-result.md`，决定 Phase 4 用 `dsh-tools` 还是 `dsh-context`。

**Architecture:** `spike/` 是独立 npm 包（不进 pnpm workspace），内含一个 Cordis 插件（纯 ESM `.js`）、一个 profile patch、一个 tsx 运行的检查脚本。脚本起一个本地 HTTP 回调服务模拟 internal 接口，验证“工具 → HTTP 回调 → 携带 sessionId”这条生产链路。

**Tech Stack:** Node 25、tsx 4.23.15、`@deepseek-ai/dsh-sdk-client` 0.2.1-rc.5 及其 peer。

**前置条件：** 需要一个可用的 `DEEPSEEK_API_KEY`（会产生少量调用费用，整轮约 10 次模型请求）。

**关于 TDD：** Spike 是探索性验证，检查脚本本身就是测试；每条标准输出 PASS/FAIL，不另写单测。Spike 代码不进入生产，Phase 4 只借用其结论和 patch 写法。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `spike/package.json` | 独立依赖，锁精确版本 |
| `spike/plugin/index.js` | Cordis 插件：注册 `spike_echo_session` 工具，回调 HTTP 并返回 sessionId |
| `spike/spike.cordis.yml` | patch：挂载插件、禁用全部内置 `tool-*` 行、覆盖系统提示 |
| `spike/lib/callback.ts` | 本地 HTTP 回调服务：校验 token、记录 sessionId、按会话发放校验码 |
| `spike/lib/events.ts` | 事件判别字段适配、工具调用提取、通知观察器 |
| `spike/lib/harness.ts` | 按生产约束创建 `DeepSeekHarness`（专用 dshHome、最小 env） |
| `spike/checks.ts` | 标准 1–4 的检查函数 |
| `spike/report.ts` | 生成 `spike-result.md` |
| `spike/run.ts` | 入口：按顺序执行检查（含标准 5），输出 PASS/FAIL 与结论 |
| `docs/superpowers/spike-result.md` | 结论（由脚本生成，人工补充备注后提交） |

---

### Task 1：Spike 工程与依赖

**Files:**
- Create: `spike/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 创建 `spike/package.json`**

```json
{
  "name": "should-quit-spike",
  "private": true,
  "type": "module",
  "scripts": {
    "spike": "tsx run.ts"
  },
  "dependencies": {
    "@deepseek-ai/cordis": "4.0.5",
    "@deepseek-ai/dsh": "0.2.1-rc.5",
    "@deepseek-ai/dsh-llm": "0.2.1-rc.5",
    "@deepseek-ai/dsh-sdk-client": "0.2.1-rc.5",
    "@deepseek-ai/dsh-sdk-protocol": "0.2.1-rc.5",
    "@deepseek-ai/dsh-session": "0.2.1-rc.5",
    "@deepseek-ai/dsh-tools": "0.2.1-rc.5"
  },
  "devDependencies": {
    "tsx": "4.23.15",
    "@types/node": "24.10.1"
  }
}
```

- [ ] **Step 2: 安装依赖（用 npm，不用 pnpm）**

插件文件 `spike/plugin/index.js` 需要 `import '@deepseek-ai/dsh-tools'`，并且必须和 dsh 运行时拿到**同一个模块实例**，否则 `defineTool` 的产物可能不被 `ctx.tools` 识别。npm 的扁平 `node_modules` 能让插件和运行时解析到同一份 `spike/node_modules/@deepseek-ai/dsh-tools`。

Run: `cd spike && npm install --save-exact && npm ls @deepseek-ai/dsh-tools`
Expected: 安装成功；`npm ls` 只出现一个 `@deepseek-ai/dsh-tools@0.2.1-rc.5`（带 `deduped` 的行也算同一份）。如果出现两个不同版本，在 `package.json` 加 `"overrides": { "@deepseek-ai/dsh-tools": "0.2.1-rc.5" }` 后重装。

`@types/node` 版本以 `npm view @types/node@24 version` 的最新 24.x 为准，替换上面的 `24.10.1`。

- [ ] **Step 3: 确认 `SessionEvent` 的类型判别字段**

Run: `grep -n "interface SessionEvent\b\|type SessionEvent\b" -A 15 spike/node_modules/@deepseek-ai/dsh-session/lib/types/*.d.ts | head -40`
Expected: 看到事件封装结构。记下判别字段名（预期是 `type`）以及负载字段名（预期是 `data` 或与判别字段平级）。Task 3 的 `eventType()` / `eventData()` 按这里的结果填写。

- [ ] **Step 4: 更新 `.gitignore`**

追加：

```gitignore
spike/node_modules/
spike/.dsh-home/
spike/workspace/
spike/result.json
```

- [ ] **Step 5: Commit**

```bash
git add spike/package.json spike/package-lock.json .gitignore
git commit -m "chore(spike): add dsh spike package"
```

---

### Task 2：只读工具插件与 profile patch

**Files:**
- Create: `spike/plugin/index.js`
- Create: `spike/spike.cordis.yml`

- [ ] **Step 1: 写插件 `spike/plugin/index.js`**

工具执行时把 `exec.agent.id`（即 sessionId）通过 HTTP 回调给宿主进程，宿主记录收到的 sessionId，这与生产中 internal 接口的身份映射链路一致。

```js
// spike/plugin/index.js —— 纯 ESM，dsh 运行时直接 import，不经 TS 编译
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'should-quit-spike'
export const inject = ['tools']

export function apply(ctx) {
  const url = process.env.SPIKE_CALLBACK_URL
  const token = process.env.SPIKE_TOKEN
  if (!url || !token) throw new Error('SPIKE_CALLBACK_URL / SPIKE_TOKEN 未设置')

  // register 返回卸载函数；Spike 进程整体退出，不处理热卸载
  ctx.tools.register(defineTool({
    name: 'spike_echo_session',
    description: 'Returns a verification code for the current conversation. Call it whenever the user asks for the code.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      // exec.agent.id 即 SessionId（dsh-agent 中 Agent = { id: SessionId }）
      const sessionId = exec.agent?.id
      if (!sessionId) return 'ERROR: no agent on tool execution context'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': token },
        body: JSON.stringify({ sessionId: String(sessionId), callId: exec.callId }),
        signal: exec.signal,
      })
      if (!res.ok) return `ERROR: callback HTTP ${res.status}`
      const { code } = await res.json()
      return `code: ${code}`
    },
  }))
}
```

校验码只能通过回调拿到，所以“回答里出现正确校验码”就证明工具确实被调用、且回调拿到的 sessionId 与当前会话一致。

- [ ] **Step 2: 写 patch `spike/spike.cordis.yml`**

patch 是 `PatchOptions` 数组：`insert` 挂载本地插件（`./` 相对 patch 文件解析为 file URL），按行 `id` 设 `disabled: true` 移除内置工具。只禁用 `tool-*` 行，不动 `bash-sandbox`、`web`、`subagent` 这类服务行，避免依赖它们的插件启动失败。patch 会整体替换目标行的 `config`，所以 `system-prompt` 行要写全需要的字段，且不能引用 `{{cwd}}`。

```yaml
- insert:
    - id: should-quit-spike
      name: ./plugin/index.js
      config: {}
- { id: tool-bash, disabled: true }
- { id: tool-pwsh, disabled: true }
- { id: tool-jobs, disabled: true }
- { id: tool-fs, disabled: true }
- { id: tool-fs-search, disabled: true }
- { id: tool-web, disabled: true }
- { id: tool-subagent, disabled: true }
- { id: tool-subagent-fork, disabled: true }
- { id: tool-subagent-control, disabled: true }
- { id: tool-subagent-list-agents, disabled: true }
- { id: tool-workflow, disabled: true }
- { id: tool-todo, disabled: true }
- { id: tool-goal, disabled: true }
- { id: tool-skill, disabled: true }
- { id: tool-working-directory, disabled: true }
- id: system-prompt
  config:
    includeHarnessIdentity: false
    personaPrefix: You are a test assistant. Answer briefly. When asked for the verification code, call the spike_echo_session tool and repeat the code exactly.
    personaSuffix: ''
```

指向不存在 id 的 patch 只在 stderr 打警告、不会失败，而 SDK 只在启动失败时才附带 stderr 尾部，正常运行时拿不到。所以 Task 7 Step 3 用 dsh CLI 的配置检查命令，逐行确认 patch 中的每个 `id` 都命中了真实的插件行。

- [ ] **Step 3: Commit**

```bash
git add spike/plugin/index.js spike/spike.cordis.yml
git commit -m "chore(spike): add read-only tool plugin and profile patch"
```

---

### Task 3：回调服务与事件适配

**Files:**
- Create: `spike/lib/callback.ts`
- Create: `spike/lib/events.ts`

- [ ] **Step 1: 写 `spike/lib/callback.ts`**

模拟生产 internal 接口：只监听 127.0.0.1，校验 token，记录每次回调的 sessionId，并按会话惰性发放互不相同的校验码。

```ts
// spike/lib/callback.ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'

export interface CallbackCall { sessionId: string; callId: string; at: number }

export interface CallbackServer {
  url: string
  token: string
  calls: CallbackCall[]
  /** 某会话的校验码；首次被问到时生成，之后固定 */
  codeFor(sessionId: string): string
  close(): Promise<void>
}

export async function startCallbackServer(): Promise<CallbackServer> {
  const token = randomBytes(16).toString('hex')
  const codes = new Map<string, string>()
  const calls: CallbackCall[] = []
  const codeFor = (sid: string): string => {
    let code = codes.get(sid)
    if (!code) {
      code = `SQ-${randomBytes(3).toString('hex').toUpperCase()}`
      codes.set(sid, code)
    }
    return code
  }

  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST' || req.headers['x-internal-token'] !== token) {
      res.writeHead(403).end()
      return
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      try {
        const { sessionId, callId } = JSON.parse(body) as { sessionId?: string; callId?: string }
        if (!sessionId) { res.writeHead(400).end(); return }
        calls.push({ sessionId, callId: String(callId ?? ''), at: Date.now() })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ code: codeFor(sessionId) }))
      } catch {
        res.writeHead(400).end()
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/tool`,
    token,
    calls,
    codeFor,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
```

- [ ] **Step 2: 写 `spike/lib/events.ts`**

`eventType()` / `eventData()` 按 Task 1 Step 3 记下的字段名填写。下面按预期结构（判别字段 `type`、负载在 `data`）给出，若实际不同只改这两个函数。

```ts
// spike/lib/events.ts
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { HarnessNotification } from '@deepseek-ai/dsh-sdk-client'

/** 事件判别字段：按 Task 1 Step 3 的结果调整 */
export function eventType(e: SessionEvent): string {
  return String((e as unknown as { type?: unknown }).type ?? '')
}

/** 事件负载：按 Task 1 Step 3 的结果调整（若负载与判别字段平级，直接返回 e） */
export function eventData(e: SessionEvent): Record<string, unknown> {
  const anyE = e as unknown as { data?: Record<string, unknown> }
  return anyE.data ?? (e as unknown as Record<string, unknown>)
}

/** 本次运行中模型调用过的工具名 */
export function toolCalls(events: SessionEvent[]): string[] {
  return events
    .filter((e) => eventType(e) === 'tool/call')
    .map((e) => String(eventData(e).name ?? ''))
}

/** 流式粒度观察：记录每条 assistant/message 到达的时间与文本长度 */
export interface StreamObservation {
  assistantMessages: Array<{ at: number; textLength: number }>
  otherMethods: Set<string>
}

export function createObserver(): {
  observation: StreamObservation
  onNotification: (n: HarnessNotification) => void
} {
  const observation: StreamObservation = { assistantMessages: [], otherMethods: new Set() }
  const onNotification = (n: HarnessNotification): void => {
    if (n.method !== 'session.event') {
      observation.otherMethods.add(n.method)
      return
    }
    const event = (n.params as { event?: SessionEvent }).event
    if (!event) return
    if (eventType(event) === 'assistant/message') {
      const message = eventData(event).message as { content?: Array<{ type?: string; text?: string }> } | undefined
      const text = (message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      observation.assistantMessages.push({ at: Date.now(), textLength: text.length })
    } else {
      observation.otherMethods.add(`session.event:${eventType(event)}`)
    }
  }
  return { observation, onNotification }
}
```

- [ ] **Step 3: 类型检查**

Run: `cd spike && npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2023 --strict --skipLibCheck --allowImportingTsExtensions lib/callback.ts lib/events.ts`
Expected: 无报错。若 `HarnessNotification` 未从包根导出，改为从 `@deepseek-ai/dsh-sdk-client` 的 `types` 声明中查找实际导出名（`grep -n "export" spike/node_modules/@deepseek-ai/dsh-sdk-client/lib/types/index.d.ts`）。

- [ ] **Step 4: Commit**

```bash
git add spike/lib/callback.ts spike/lib/events.ts
git commit -m "chore(spike): add callback server and event helpers"
```

---

### Task 4：按生产约束创建 Harness

**Files:**
- Create: `spike/lib/harness.ts`

- [ ] **Step 1: 写 `spike/lib/harness.ts`**

`env` 会整体替换子进程环境，所以只传最小集合：API Key、回调地址与 token、`PATH`、`HOME`。用专用 `dshHome`，与本机 `~/.dsh` 隔离；`cwd` 指向空的 `spike/workspace`，即便工具禁用失败也不会暴露项目文件。

```ts
// spike/lib/harness.ts
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import type { CallbackServer } from './callback.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
export const DSH_HOME = join(root, '.dsh-home')
export const WORKSPACE = join(root, 'workspace')
export const PATCH = join(root, 'spike.cordis.yml')

export function createHarness(cb: CallbackServer): DeepSeekHarness {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未设置')
  mkdirSync(DSH_HOME, { recursive: true })
  mkdirSync(WORKSPACE, { recursive: true })
  return new DeepSeekHarness({
    profile: 'sdk',
    patches: [PATCH],
    dshHome: DSH_HOME,
    cwd: WORKSPACE,
    processCwd: root,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    maxTokens: 2048,
    initializeTimeoutMs: 60_000,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      DEEPSEEK_API_KEY: apiKey,
      SPIKE_CALLBACK_URL: cb.url,
      SPIKE_TOKEN: cb.token,
    },
  })
}
```

`initializeTimeoutMs` 放宽到 60 秒：`sdk` profile 首次使用会在 `dshHome` 下初始化，可能比默认 10 秒慢。

- [ ] **Step 2: Commit**

```bash
git add spike/lib/harness.ts
git commit -m "chore(spike): add harness factory with minimal env"
```

---

### Task 5：标准 1–4 的检查函数

**Files:**
- Create: `spike/checks.ts`

每个检查返回 `CheckResult`，内部异常也转成 FAIL，不让一条失败中断后续检查。模型回答带随机性，所以断言只看“确定性证据”：工具调用事件、回调记录、只能通过回调拿到的校验码。

- [ ] **Step 1: 写 `spike/checks.ts` 的公共部分与标准 1**

```ts
// spike/checks.ts
import type { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import type { CallbackServer } from './lib/callback.ts'
import { createObserver, toolCalls, type StreamObservation } from './lib/events.ts'

export interface CheckResult {
  id: number
  title: string
  pass: boolean
  evidence: string[]
}

const FORBIDDEN_TOOLS = ['bash', 'pwsh', 'read', 'write', 'edit', 'web_search', 'web_fetch', 'subagent']

export async function guard(id: number, title: string, fn: (ev: string[]) => Promise<boolean>): Promise<CheckResult> {
  const evidence: string[] = []
  try {
    return { id, title, pass: await fn(evidence), evidence }
  } catch (err) {
    evidence.push(`异常：${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    return { id, title, pass: false, evidence }
  }
}

/** 标准 1：内置危险工具已移除。诱导模型执行 shell / 读文件，断言没有任何被禁工具的 tool/call */
export function checkToolsRemoved(h: DeepSeekHarness): Promise<CheckResult> {
  return guard(1, '自定义 patch 启动，bash/文件系统工具已移除', async (ev) => {
    const r = await h.run('List the exact names of every tool you can call, comma separated. Then try to run the shell command `ls /` and read the file /etc/hosts.')
    const called = toolCalls(r.events)
    const bad = called.filter((n) => FORBIDDEN_TOOLS.includes(n))
    ev.push(`模型自述可用工具：${r.finalResponse.slice(0, 300)}`)
    ev.push(`实际 tool/call：${called.join(', ') || '（无）'}`)
    if (bad.length) ev.push(`被禁工具仍被调用：${bad.join(', ')}`)
    return bad.length === 0
  })
}
```

“模型自述”只作为参考证据写进报告，判定以 `tool/call` 事件为准，因为模型可能编造工具列表。

- [ ] **Step 2: 追加标准 2（工具调用 + sessionId）与标准 3（并发）**

```ts
/** 标准 2：自定义工具被调用，回调收到的 sessionId 与当前会话一致，且回答里出现该会话的校验码 */
export function checkCustomTool(h: DeepSeekHarness, cb: CallbackServer, stream: StreamObservation[]): Promise<CheckResult> {
  return guard(2, '自定义 Cordis 工具可被调用并拿到 sessionId', async (ev) => {
    const session = h.session()
    const before = cb.calls.length
    const { observation, onNotification } = createObserver()
    const r = await session.run('What is the verification code? Use your tool.', { onNotification })
    stream.push(observation)
    const newCalls = cb.calls.slice(before)
    const code = cb.codeFor(session.id)
    ev.push(`会话 id：${session.id}`)
    ev.push(`回调记录的 sessionId：${newCalls.map((c) => c.sessionId).join(', ') || '（无回调）'}`)
    ev.push(`期望校验码 ${code}；回答：${r.finalResponse.slice(0, 200)}`)
    const idMatch = newCalls.length > 0 && newCalls.every((c) => c.sessionId === session.id)
    return idMatch && r.finalResponse.includes(code)
  })
}

/** 标准 3：同一进程两个会话并发提问，都完成，且各自拿到自己的校验码（证明 sessionId 没串） */
export function checkConcurrent(h: DeepSeekHarness, cb: CallbackServer): Promise<CheckResult> {
  return guard(3, '同一进程两个会话并发提问都能完成', async (ev) => {
    const a = h.session()
    const b = h.session()
    const ask = 'What is the verification code? Use your tool.'
    const [ra, rb] = await Promise.all([a.run(ask), b.run(ask)])
    const ca = cb.codeFor(a.id)
    const cbb = cb.codeFor(b.id)
    ev.push(`A(${a.id}) 期望 ${ca}：${ra.finalResponse.slice(0, 120)}`)
    ev.push(`B(${b.id}) 期望 ${cbb}：${rb.finalResponse.slice(0, 120)}`)
    return ca !== cbb
      && ra.finalResponse.includes(ca) && !ra.finalResponse.includes(cbb)
      && rb.finalResponse.includes(cbb) && !rb.finalResponse.includes(ca)
  })
}
```

- [ ] **Step 3: 追加标准 4（进程重启后 resume）**

先在第一个 harness 里让模型记住一个随机口令，关闭 harness（子进程被回收），再新建一个 harness，`resumeSession` 同一个 id 后追问口令。口令只出现在第一轮对话中，答对即证明历史从 `dshHome` 恢复成功。

```ts
/** 标准 4：关闭进程后新起一个进程，resumeSession 能接上之前的对话 */
export function checkResume(makeHarness: () => DeepSeekHarness): Promise<CheckResult> {
  return guard(4, '进程重启后 resumeSession 能接上之前的对话', async (ev) => {
    const secret = `PINEAPPLE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const first = makeHarness()
    let sessionId: string
    try {
      const s = first.session()
      sessionId = s.id
      await s.run(`Remember this passphrase exactly: ${secret}. Reply only with "OK".`)
    } finally {
      await first.close()
    }
    ev.push(`会话 id：${sessionId}；口令：${secret}`)

    const second = makeHarness()
    try {
      const resumed = await second.resumeSession(sessionId)
      const r = await resumed.run('What passphrase did I ask you to remember? Reply with the passphrase only.')
      ev.push(`resume 后回答：${r.finalResponse.slice(0, 200)}`)
      return resumed.id === sessionId && r.finalResponse.includes(secret)
    } finally {
      await second.close()
    }
  })
}
```

- [ ] **Step 4: 类型检查**

Run: `cd spike && npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2023 --strict --skipLibCheck --allowImportingTsExtensions checks.ts`
Expected: 无报错。

- [ ] **Step 5: Commit**

```bash
git add spike/checks.ts
git commit -m "chore(spike): add checks for criteria 1-4"
```

---

### Task 6：报告生成与入口脚本

**Files:**
- Create: `spike/report.ts`
- Create: `spike/run.ts`

- [ ] **Step 1: 写 `spike/report.ts`**

报告同时给出结论（`AGENT_ENGINE` 取值）和每条证据，方便人工复核。流式粒度单独成节，不参与 A/B 判定。

```ts
// spike/report.ts
import type { CheckResult } from './checks.ts'
import type { StreamObservation } from './lib/events.ts'

export interface SpikeReport {
  startedAt: string
  platform: string
  nodeVersion: string
  checks: CheckResult[]
  stream: StreamObservation[]
  stderrWarnings: string[]
}

export function decision(checks: CheckResult[]): 'dsh-tools' | 'dsh-context' {
  return checks.length === 5 && checks.every((c) => c.pass) ? 'dsh-tools' : 'dsh-context'
}

export function renderMarkdown(r: SpikeReport): string {
  const lines: string[] = []
  const engine = decision(r.checks)
  lines.push('# dsh 技术验证结果', '')
  lines.push(`- 时间：${r.startedAt}`)
  lines.push(`- 平台：${r.platform}；Node ${r.nodeVersion}`)
  lines.push(`- 结论：\`AGENT_ENGINE=${engine}\``, '')
  lines.push('| # | 标准 | 结果 |', '|---|---|---|')
  for (const c of [...r.checks].sort((a, b) => a.id - b.id)) {
    lines.push(`| ${c.id} | ${c.title} | ${c.pass ? 'PASS' : 'FAIL'} |`)
  }
  lines.push('', '## 证据', '')
  for (const c of [...r.checks].sort((a, b) => a.id - b.id)) {
    lines.push(`### ${c.id}. ${c.title}`, '')
    for (const e of c.evidence) lines.push(`- ${e.replace(/\n/g, ' ')}`)
    lines.push('')
  }
  lines.push('## 流式粒度（不参与判定）', '')
  for (const [i, o] of r.stream.entries()) {
    const gaps = o.assistantMessages.map((m, j, arr) => (j === 0 ? 0 : m.at - arr[j - 1].at))
    lines.push(`- 观察 ${i + 1}：assistant/message ${o.assistantMessages.length} 条，文本长度 ${o.assistantMessages.map((m) => m.textLength).join('/')}，间隔 ms ${gaps.join('/')}`)
    lines.push(`  - 其他通知：${[...o.otherMethods].join(', ') || '（无）'}`)
  }
  lines.push('', '每个 step 结束才到一条 assistant/message，说明只能按 step 推送；Phase 4 的 `delta` 事件按 step 粒度发送。', '')
  lines.push('## patch 警告（stderr）', '')
  lines.push(...(r.stderrWarnings.length ? r.stderrWarnings.map((w) => `- ${w}`) : ['- （无）']))
  lines.push('', '## 人工备注', '', '（执行人补充：异常现象、绕过办法、对 Phase 4 的影响）', '')
  return lines.join('\n')
}
```

- [ ] **Step 2: 写 `spike/run.ts`**

标准 5（macOS Seatbelt 下子进程能启动）由 `start()` 握手是否成功判定，并且最先执行：起不来的话后面的检查没有意义，直接全部记 FAIL。

stderr 警告的收集方式：`HarnessClient` 只在传输关闭的错误里附带 stderr 尾部，没有实时 stderr 钩子，所以这里在 `close()` 前读取 `harness.client` 上公开的 stderr 相关属性；如果 0.2.1-rc.5 没有公开，就留空，由执行人手动跑一次 `dsh --profile sdk --patch spike.cordis.yml` 看启动输出，把警告抄进“人工备注”。

```ts
// spike/run.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startCallbackServer } from './lib/callback.ts'
import { createHarness } from './lib/harness.ts'
import type { StreamObservation } from './lib/events.ts'
import { checkToolsRemoved, checkCustomTool, checkConcurrent, checkResume, guard, type CheckResult } from './checks.ts'
import { renderMarkdown, decision, type SpikeReport } from './report.ts'

const root = dirname(fileURLToPath(import.meta.url))
const docPath = join(root, '..', 'docs', 'superpowers', 'spike-result.md')

async function main(): Promise<void> {
  const cb = await startCallbackServer()
  const stream: StreamObservation[] = []
  const checks: CheckResult[] = []
  const harness = createHarness(cb)

  try {
    const started = await guard(5, `本机 ${process.platform} 上子进程能正常启动`, async (ev) => {
      const t0 = Date.now()
      await harness.start()
      ev.push(`initialize 握手耗时 ${Date.now() - t0} ms`)
      return true
    })
    checks.push(started)

    if (started.pass) {
      checks.push(await checkToolsRemoved(harness))
      checks.push(await checkCustomTool(harness, cb, stream))
      checks.push(await checkConcurrent(harness, cb))
    } else {
      for (const [id, title] of [[1, '工具移除'], [2, '自定义工具'], [3, '并发']] as const) {
        checks.push({ id, title, pass: false, evidence: ['子进程未能启动，跳过'] })
      }
    }
  } finally {
    await harness.close()
  }

  // 标准 4 自己管理两个 harness 的生命周期，放在主 harness 关闭之后，避免同一 dshHome 下两个进程争用会话
  if (checks.find((c) => c.id === 5)?.pass) {
    checks.push(await checkResume(() => createHarness(cb)))
  } else {
    checks.push({ id: 4, title: 'resume', pass: false, evidence: ['子进程未能启动，跳过'] })
  }
  await cb.close()

  const report: SpikeReport = {
    startedAt: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    nodeVersion: process.version,
    checks,
    stream,
    stderrWarnings: [],
  }
  writeFileSync(join(root, 'result.json'), JSON.stringify(report, (_k, v) => (v instanceof Set ? [...v] : v), 2))
  mkdirSync(dirname(docPath), { recursive: true })
  writeFileSync(docPath, renderMarkdown(report))

  for (const c of [...checks].sort((a, b) => a.id - b.id)) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}. ${c.title}`)
  }
  console.log(`\nAGENT_ENGINE=${decision(checks)}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 3: 类型检查**

Run: `cd spike && npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2023 --strict --skipLibCheck --allowImportingTsExtensions run.ts`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add spike/report.ts spike/run.ts
git commit -m "chore(spike): add report and entry script"
```

---

### Task 7：执行 Spike 并记录结论

**Files:**
- Create: `docs/superpowers/spike-result.md`（脚本生成）

- [ ] **Step 1: 运行**

Run: `cd spike && DEEPSEEK_API_KEY=<你的 key> npm run spike`
Expected: 输出 5 行 PASS/FAIL 和一行 `AGENT_ENGINE=...`；生成 `spike/result.json` 与 `docs/superpowers/spike-result.md`。整轮通常 2–5 分钟。

不要把 key 写进任何文件或 shell 历史；可以先 `read -s DEEPSEEK_API_KEY && export DEEPSEEK_API_KEY` 再运行 `npm run spike`。

- [ ] **Step 2: 失败时的排查顺序**

| 现象 | 先查 |
|---|---|
| 标准 5 FAIL，报 initialize 超时 | 去掉 `env` 参数直接继承父环境再跑一次。若通过，说明缺了某个运行必需的环境变量（如 `TMPDIR`、`USER`），补进 `harness.ts` 的 env 白名单 |
| 标准 5 FAIL，报插件加载失败 | 插件 `import '@deepseek-ai/dsh-tools'` 解析失败。确认 `npm ls @deepseek-ai/dsh-tools` 只有一份；仍失败就把插件改成 `spike/node_modules/should-quit-spike-plugin` 本地包，patch 里用包名引用 |
| 标准 1 FAIL | 看证据里实际调用的工具名，在 patch 里补对应的 `tool-*` 行 id（行 id 用 `npx dsh config` 类命令或读 `node_modules/@deepseek-ai/dsh-base` 的 yml 确认） |
| 标准 2 FAIL，回调无记录 | 模型没调工具：看 `tool/call` 证据；若工具不在模型可见列表里，检查 `inject: ['tools']` 与 `register` 是否执行（在 `apply` 里 `console.error` 一行） |
| 标准 2 FAIL，sessionId 不一致 | `exec.agent.id` 不等于 SDK 会话 id。记录两者的实际值，这是 A 方案的阻塞项 |
| 标准 4 FAIL | 确认两次 `createHarness` 用的是同一个 `dshHome`；看 `.dsh-home/sessions/` 下是否有该会话的 jsonl |

每条最多调整两次。仍失败就如实记 FAIL，结论走 `dsh-context`，不要为了让 A 通过而放宽断言。

- [ ] **Step 3: 补充人工备注**

在 `docs/superpowers/spike-result.md` 的“人工备注”一节写明：
- 流式粒度结论（逐 step 还是只有最终一条），Phase 4 `delta` 按此实现。
- 实际有效的 patch 行 id 清单（Phase 4 的 `should-quit.cordis.yml` 直接沿用）。
- 插件依赖解析方式（相对路径 `.js` 还是本地包）。
- 运行必需的 env 白名单。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/spike-result.md
git commit -m "docs: record dsh spike result"
```

Phase 1 完成的标志：`spike-result.md` 已提交，且明确写出 `AGENT_ENGINE` 取值。Phase 4 开始前先读这份文件。

# Phase 5：小程序实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付「该溜吗」全部微信小程序页面及请求、流解析、Canvas 趋势图。

**Architecture:** Taro React 页面消费 shared DTO；zustand 管登录与权威评分；普通请求与分块请求共用错误恢复策略。图表几何、聊天状态归并使用纯函数，页面只处理展示和交互。

**Tech Stack:** Taro 4.3.1、React 18.3.1、zustand 5.0.16、TypeScript 5.9.3、vitest 5.0.5；CSS、Canvas 2D，无图表库。

**Spec:** `docs/superpowers/specs/2026-10-31-should-quit-design.md` §7–9；消费总览 §4、Phase 2 DTO 与 Phase 3/4 HTTP 接口。

## Global Constraints

- 产品名「该溜吗」；基础库 ≥2.20.2；所有评分与选项使用 shared，服务端返回权威分。
- 布局以设计 §7.1 为准；参考 `.superpowers/brainstorm/75119-1793435677/`：baseline A、home B、trend C、chat A。草图颜色/示例值不覆盖设计算法。
- 四 tab：首页、趋势、顾问、我的；启动、基准、聊天为非 tab 页。纯文本渲染备注及回答。
- 新依赖精确锁定：`npm view @tarojs/cli@4.3.1 version` 与 `npm view @tarojs/webpack5-runner@4.3.1 version` 于2026-11-01均返回4.3.1。其他 Taro 包沿用总览4.3.1；不引入 Sass、图表库或日期库。
- agent 请求和 app networkTimeout.request 均320000；不支持的基础库显示升级提示。

## Review Focus

1. 并发401只登录一次，登录本身401不能循环（Task 2）。
2. headers与chunk到达顺序颠倒，非SSE错误被分块（Task 3）。
3. 闰月、跨年、无before的趋势起点不能凭空补零（Task 5）。
4. 切页/旧请求迟到不能覆盖当前聊天或趋势（Task 3/5/6）。
5. 打卡失败保留输入，跨北京时间午夜正确刷新今日次数（Task 4）。

## 文件结构

路径均相对 `apps/miniapp/`，每个页面另有 `index.config.ts`、`index.css`。

| 文件 | 职责 |
|---|---|
| package.json、tsconfig.json、config/index.ts、project.config.json | 构建、微信工程和环境地址 |
| src/app.tsx、app.config.ts、app.css | 路由、tab、全局样式 |
| src/services/auth.ts、request.ts、api.ts、agent-stream.ts | 登录、JSON请求、类型化接口、SSE |
| src/stores/auth.ts、score.ts、chat.ts | 登录单飞、当前分、每会话聊天状态 |
| src/pages/{launch,baseline,home,trend,advisor,chat,mine}/index.tsx | 七个页面 |
| src/components/baseline-question/index.tsx、score-card/index.tsx、mood-stars/index.tsx | 选项、评分卡、星级 |
| src/components/trend-chart/{geometry.ts,index.tsx} | 补点与坐标、Canvas绘制 |
| src/components/mood-calendar/{calendar.ts,index.tsx} | 月格与分段、日历 |
| test/*.test.ts、docs/miniapp-smoke.md | 纯逻辑测试与真机验收记录 |

### Task 1：可构建的 Taro 工程

**Files:** 新增上述工程配置、app文件、七页占位；`apps/miniapp/test/config.test.ts`；修改 pnpm-lock.yaml。

**Interfaces:** 包名 `@should-quit/miniapp`；scripts：test=vitest run、typecheck=tsc --noEmit、build:weapp=taro build --type weapp；API_BASE_URL 通过构建配置注入。

- [ ] **Step 1: 写失败测试。** config.test 验证七路由、四tab顺序和320000超时；构建产物存在app.json，页面路径一致。
- [ ] **Step 2: 运行确认失败。** `pnpm --filter @should-quit/miniapp test -- config`，预期缺少对应实现或断言失败。
- [ ] **Step 3: 最小实现。** 使用webpack5 runner；锁 @tarojs/cli、webpack5-runner、taro、components、react、runtime、shared、helper、plugin-framework-react、plugin-platform-weapp 为4.3.1，react/react-dom18.3.1、zustand5.0.16，shared workspace:*；复用根TS/vitest，不添加类型包除非 npm view 核实。配置 JSX react-jsx；开发/生产API地址分开；appid从本地project配置提供，不把密钥写入工程。
- [ ] **Step 4: 运行确认通过。** `pnpm --filter @should-quit/miniapp test -- config`，预期全部 PASS；再运行本包 typecheck。
- [ ] **Step 5: 提交。** 只暂存本 Task 的 Files，提交 `git commit -m "chore(miniapp): scaffold Taro application"`。

### Task 2：登录与请求恢复

**Files:** 新增 services/{auth,request,api}.ts、stores/{auth,score}.ts、test/request.test.ts；实现 pages/launch/index.tsx。

**Interfaces:** `login():Promise<LoginResponse>`、`request<T>(path:string,options?:RequestOptions):Promise<T>`、`ensureLogin():Promise<LoginResponse>`；auth存token/user/hasBaseline；score存 `ScoreView|null` 与 setScore。api提供设计§5全部类型化接口。

- [ ] **Step 1: 写失败测试。** mock Taro：自动Bearer；两请求同时401只wx.login一次，各重试一次；重试仍401立即失败；login401直接提示登录失败；409 BASELINE_REQUIRED只导航一次；429/503 toast含message；网络错误可重试；新登录用户变化清空score/chat缓存。
- [ ] **Step 2: 运行确认失败。** `pnpm --filter @should-quit/miniapp test -- request`，预期缺少对应实现或断言失败。
- [ ] **Step 3: 最小实现。** token存Taro storage；登录Promise单飞且finally清理；登录接口绕开恢复逻辑；先恢复再重新构建Authorization。launch根据hasBaseline reLaunch录入或switchTab首页；其他页onShow检查登录和基准门槛，避免从分享直接进入绕过。API请求不打印body。
- [ ] **Step 4: 运行确认通过。** `pnpm --filter @should-quit/miniapp test -- request`，预期全部 PASS；再运行本包 typecheck。
- [ ] **Step 5: 提交。** 只暂存本 Task 的 Files，提交 `git commit -m "feat(miniapp): add authenticated request layer"`。

### Task 3：分块 SSE 与聊天状态

**Files:** 新增 services/agent-stream.ts、stores/chat.ts、test/agent-stream.test.ts。

**Interfaces:** `askStream(id:string,text:string,onEvent:(event:AgentEvent)=>void):{finished:Promise<void>;abort():void}`；chat按conversationId保存消息、工具行、pending、原问题；消费 shared Utf8StreamDecoder/SseParser/parseAgentEvent。

- [ ] **Step 1: 写失败测试。** 对中英文在每字节切分、跨帧、ping、多个帧测试文本一致；chunk先到headers也可解析；大小写Content-Type含charset；非SSE401/409/429/503分块JSON走Task2策略；401最多重发一次且仅未收到SSE时；done后close正常、无done断流为中断；error保留部分文本；abort清监听不影响其他会话；旧generation事件不覆盖新轮。
- [ ] **Step 2: 运行确认失败。** `pnpm --filter @should-quit/miniapp test -- agent-stream`，预期缺少对应实现或断言失败。
- [ ] **Step 3: 最小实现。** Taro.request enableChunked:true、timeout320000；onHeadersReceived判200+text/event-stream后才喂解析器，提前chunk暂存；非SSE累积后只解析一次JSON，success.data与chunk不得重复拼接。flush decoder只一次；未知坏帧按shared跳过；finished未收到done/error视为中断。切页abort仅断连接，后台继续；回页先拉历史且避免自动补发原问题。工具状态保留当前页面会话内，历史DTO不含工具事件，不伪造持久历史。
- [ ] **Step 4: 运行确认通过。** `pnpm --filter @should-quit/miniapp test -- agent-stream`，预期全部 PASS；再运行本包 typecheck。
- [ ] **Step 5: 提交。** 只暂存本 Task 的 Files，提交 `git commit -m "feat(miniapp): support chunked agent responses"`。

### Task 4：基准问卷、首页与我的

**Files:** 实现 pages/{baseline,home,mine}/index.tsx、components/{baseline-question,score-card,mood-stars}/index.tsx；新增 test/baseline-home.test.ts。

**Interfaces:** 消费 BASELINE_FIELDS/OPTIONS/objectiveScore、PUT baseline返回ScoreView、POST moods返回ScoreView；抽出 `previewBaseline(draft:Partial<BaselineInput>):{score:number;complete:boolean}` 供单测。

- [ ] **Step 1: 写失败测试。** 选项顺序与level解耦；未填完8项不得提交；预览以未填项暂按level3计算但明确显示“未填项暂按一般预览”；全填后与shared一致；全1=0、全5=100；保存/打卡成功直接setScore；失败不清星级备注；防双击重复提交；北京时间午夜日期变化刷新次数。
- [ ] **Step 2: 运行确认失败。** `pnpm --filter @should-quit/miniapp test -- baseline-home`，预期缺少对应实现或断言失败。
- [ ] **Step 3: 最小实现。** 首次一屏一项、N/8、选择自动下一项，可返回修改；编辑先总览，点单项修改，保存整份后回总览；保存首次跳首页。首页打卡在上、紧凑评分卡在下、guidance可展开、moodScore null提示去打卡；今日次数首次/onShow调用moods?date=today恢复，成功本地+1，日期变化重读，避免异步旧值覆盖；日期用shared localDate。我的提供编辑基准、免责声明、关于。onShareAppMessage标题取当前slogan。星级aria-label，44px点击区，对比度≥4.5:1。
- [ ] **Step 4: 运行确认通过。** `pnpm --filter @should-quit/miniapp test -- baseline-home`，预期全部 PASS；再运行本包 typecheck。
- [ ] **Step 5: 提交。** 只暂存本 Task 的 Files，提交 `git commit -m "feat(miniapp): add baseline and daily check-in pages"`。

### Task 5：Canvas 趋势与心情日历

**Files:** 实现 trend-chart、mood-calendar及pages/trend；新增 test/trend.test.ts。

**Interfaces:** `fillTrend(data:TrendResponse,start:string,end:string):{date:string;score:number|null}[]`、`chartPoints(rows,width,height):{date:string;score:number|null;x:number;y:number|null}[]`、`nearestPoint(points,x)`；`monthCells(month:string,daily:MoodDailyItem[])` 返回日期与avg/count。

- [ ] **Step 1: 写失败测试。** before=47且首天无快照沿用47；before=null时首快照之前均null、不反向填充；无数据空态；7/30/90天、单点、score0/100、最近点越界钳制；2028-02有29天、跨年正确；avg25/25.01/50/50.01/75/75.01分段连续；切range/月旧响应不覆盖新值。
- [ ] **Step 2: 运行确认失败。** `pnpm --filter @should-quit/miniapp test -- trend`，预期缺少对应实现或断言失败。
- [ ] **Step 3: 最小实现。** Canvas type=2d，经selectorQuery取node/尺寸，按devicePixelRatio缩放，绘0/20/60/80/100刻度和四档背景带，null断线、单点画圆；touch clientX减画布left，查最近有效点显示日期分数。摘要用首末有效分，无数据不声称涨跌。日历view绘制，数字+颜色；色段按连续区间≤25、≤50、≤75、其余，不round avg。月查询仅有daily?days=90：固定取90天，月份翻页限制在这90天覆盖月份，窗口外日期标“超出可查看范围”且不冒充未打卡，未来日禁用；此限制见待同步。点有效日期用moods?date读取明细底部sheet，展示星级/时间/纯文本备注；请求generation防迟到。
- [ ] **Step 4: 运行确认通过。** `pnpm --filter @should-quit/miniapp test -- trend`，预期全部 PASS；再运行本包 typecheck。
- [ ] **Step 5: 提交。** 只暂存本 Task 的 Files，提交 `git commit -m "feat(miniapp): add Canvas trends and mood calendar"`。

### Task 6：顾问列表与聊天页

**Files:** 实现pages/{advisor,chat}/index.tsx；新增test/chat.test.ts。

**Interfaces:** 消费conversations/config/messages端点及Task3 askStream；`retry(conversationId,originalText)` 每次新POST，保留旧记录。

- [ ] **Step 1: 写失败测试。** 空会话显示presetQuestions，点击发送一次；列表倒序；delta追加而非替换，tool行回答结束后仍保留；done使用真实messageId并刷新历史；FAILED/INTERRUPTED显示重试；busy提示固定文案；切换会话不串消息；网络失败保留原问题和已收文本。
- [ ] **Step 2: 运行确认失败。** `pnpm --filter @should-quit/miniapp test -- chat`，预期缺少对应实现或断言失败。
- [ ] **Step 3: 最小实现。** 经典气泡、灰色工具行、纯文本段落；发送时禁重复，历史加载失败有重试。AGENT_BUSY显示“上一条回答还在后台收尾，稍等片刻再试，或新开一个会话”。重试重新发送原文本，原FAILED/INTERRUPTED消息不覆盖；新会话按钮POST后navigateTo聊天。页面卸载断连接，后台继续；再次进入以服务器历史为准。
- [ ] **Step 4: 运行确认通过。** `pnpm --filter @should-quit/miniapp test -- chat`，预期全部 PASS；再运行本包 typecheck。
- [ ] **Step 5: 提交。** 只暂存本 Task 的 Files，提交 `git commit -m "feat(miniapp): add advisor conversations"`。

### Task 7：联调与真机验收

**Files:** 新增 `docs/miniapp-smoke.md`；按验收修正本阶段文件。

**Interfaces:** 消费Phase3完整HTTP与Phase4 fake/两个真实引擎，UI不按引擎分叉。

- [ ] **Step 1: 写失败测试。** 冒烟清单逐项记录设备/基础库/结果：启动→409→问卷→首页打卡→编辑→趋势→月明细→新聊天→续聊→重试；断网保输入、401只重登一次、超时后busy、新会话可问、切页回历史、分享slogan；真机中文分块正确。
- [ ] **Step 2: 运行确认失败。** `pnpm --filter @should-quit/miniapp test`，预期缺少对应实现或断言失败。
- [ ] **Step 3: 最小实现。** 执行pnpm -r test及typecheck、pnpm --filter @should-quit/miniapp build:weapp；开发者工具导入dist，真机HTTPS合法域名联调。fake完整验收；按Spike结论验收部署引擎，另一真实模式保留自动化契约测试；无Key或无真机明确记录未验证，不宣称通过。
- [ ] **Step 4: 运行确认通过。** `pnpm --filter @should-quit/miniapp test`，预期全部 PASS；再运行本包 typecheck。
- [ ] **Step 5: 提交。** 只暂存本 Task 的 Files，提交 `git commit -m "test(miniapp): document integrated smoke checks"`。

## 联合评审修正

- Task 1 增加 `build` script，值为 `taro build --type weapp`，以兼容Phase2根 `pnpm -r build`；miniapp tsconfig额外包含DOM类型，关闭声明输出；agent-plugin必须具有同样的build/test/typecheck入口。
- Task 2 的 RequestOptions 定义为 `{method?:'GET'|'POST'|'PUT';data?:unknown}`；消费 DTO 返回类型，不重新定义同名响应。微信mock登录每次wx.login code会变化，开发工具固定mock code只在显式开发开关下使用；真实模式仍调用wx.login。
- Task 3 headers到达前可缓存分块；只在明确HTTP401且没有SSE事件时允许一次自动重发，网络中断不能自动重发POST，防止重复计费和消息。
- Task 4 输入note maxlength=200并走shared schema；提交中的按钮disabled；preview函数单独放 `src/pages/baseline/model.ts`，相关测试不依赖Taro页面运行时。
- Task 5 chartPoints 固定边距left32/right12/top12/bottom24，y按100→top、0→height-bottom线性换算，单日期居中；nearestPoint仅从非null点选择，无点返回null。月份范围限制为本次明确记录的设计差异。
- Task 6 重试在完成或中断后允许；恢复历史若仍只有USER则提示后台可能仍在运行，不自动重发。
- 联合评审完整记录见04末尾；04/05任务均有失败断言、执行命令、最小实现和提交步骤。暂无未经说明的跨阶段名称变更。

## 完整代码清单（按 Task 顺序落盘）

下面代码属于计划正文，不是对当前源码的修改。每个清单首行是目标路径；JSON块中的说明注释须删除。执行时先创建测试并确认失败，再创建对应实现，最后运行 Task 指定命令、typecheck 和 build。

### Task 1 · 工程配置

```json
// apps/miniapp/package.json
{
  "name": "@should-quit/miniapp", "private": true, "type": "module",
  "scripts": { "build": "taro build --type weapp", "build:weapp": "taro build --type weapp", "dev": "taro build --type weapp --watch", "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@should-quit/shared": "workspace:*", "@tarojs/components": "4.3.1", "@tarojs/taro": "4.3.1",
    "@tarojs/runtime": "4.3.1", "@tarojs/react": "4.3.1", "@tarojs/shared": "4.3.1",
    "react": "18.3.1", "react-dom": "18.3.1", "zustand": "5.0.16"
  },
  "devDependencies": {
    "@tarojs/cli": "4.3.1", "@tarojs/webpack5-runner": "4.3.1", "@tarojs/helper": "4.3.1",
    "@tarojs/plugin-framework-react": "4.3.1", "@tarojs/plugin-platform-weapp": "4.3.1",
    "@types/react": "18.3.26", "vitest": "5.0.5"
  }
}
```

```json
// apps/miniapp/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM"], "types": ["@tarojs/taro", "node"], "noEmit": true, "declaration": false },
  "include": ["src", "config", "test", "vitest.config.ts"]
}
```

```ts
// apps/miniapp/config/index.ts
import { defineConfig } from '@tarojs/cli'
export default defineConfig({
  projectName: 'should-quit', date: '2026-11-01', designWidth: 750,
  sourceRoot: 'src', outputRoot: 'dist', framework: 'react', compiler: 'webpack5',
  plugins: ['@tarojs/plugin-platform-weapp'],
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api'),
    MOCK_LOGIN_CODE: JSON.stringify(process.env.NODE_ENV !== 'production' ? process.env.MOCK_LOGIN_CODE ?? '' : ''),
  },
  mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } },
})
```

```json
// apps/miniapp/project.config.json
{
  "miniprogramRoot": "dist/", "projectname": "should-quit", "appid": "touristappid",
  "compileType": "miniprogram", "libVersion": "2.20.2",
  "setting": { "es6": true, "minified": true, "urlCheck": true }
}
```

```ts
// apps/miniapp/src/env.d.ts
/// <reference types="@tarojs/taro" />
declare const API_BASE_URL: string
declare const MOCK_LOGIN_CODE: string
declare module '*.css'
```

```ts
// apps/miniapp/src/app.config.ts
export default defineAppConfig({
  pages: ['pages/launch/index', 'pages/baseline/index', 'pages/home/index', 'pages/trend/index',
    'pages/advisor/index', 'pages/chat/index', 'pages/mine/index'],
  window: { navigationBarTitleText: '该溜吗', navigationBarBackgroundColor: '#fafafa', navigationBarTextStyle: 'black' },
  networkTimeout: { request: 320000 },
  tabBar: { color: '#555555', selectedColor: '#8a4b00', list: [
    { pagePath: 'pages/home/index', text: '首页' }, { pagePath: 'pages/trend/index', text: '趋势' },
    { pagePath: 'pages/advisor/index', text: '顾问' }, { pagePath: 'pages/mine/index', text: '我的' },
  ] },
})
```

```tsx
// apps/miniapp/src/app.tsx
import type { PropsWithChildren } from 'react'
import './app.css'
export default function App({ children }: PropsWithChildren) { return children }
```

```css
/* apps/miniapp/src/app.css；页面复用本文件，不必创建空index.css */
page { background: #fafafa; color: #222; font-size: 30px; }
.screen { padding: 28px; padding-bottom: 60px; }
.card { background: white; border: 1px solid #ddd; border-radius: 20px; padding: 24px; margin-bottom: 24px; }
button { min-height: 88px; min-width: 88px; margin-top: 16px; font-size: 30px; color: #222; }
.primary { background: #222; color: white; }
.muted { color: #555; font-size: 26px; }
.error { color: #a21d1d; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.title { font-size: 36px; font-weight: bold; margin-bottom: 16px; }
.score { font-size: 56px; font-weight: bold; }
.note { border: 1px solid #999; padding: 16px; width: auto; min-height: 90px; }
.option { border: 2px solid #999; background: white; text-align: left; padding: 16px; }
.selected { border-color: #8a4b00; background: #fff3df; }
.stars { display: flex; justify-content: center; }
.stars button { margin: 0; padding: 0; width: 110px; color: #825000; }
.sheet { position: fixed; bottom: 0; left: 0; right: 0; background: white; border: 2px solid #999; padding: 28px; max-height: 65vh; overflow: auto; z-index: 20; }
.calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.day { min-width: 0; width: 100%; min-height: 88px; padding: 8px 0; margin: 0; font-size: 24px; color: #222; }
.red { background: #f8b4b4; } .orange { background: #fcd9a8; } .yellow { background: #fdf0b0; }
.green { background: #c9eac0; } .gray { background: #eee; }
.bubble { white-space: pre-wrap; word-break: break-all; padding: 20px; border: 1px solid #ccc; border-radius: 18px; margin: 16px 0; background: white; }
.user { background: #e3edff; margin-left: 80px; } .assistant { margin-right: 40px; }
.chat-input { padding-bottom: env(safe-area-inset-bottom); }
```

```ts
// apps/miniapp/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' }, define: {
  API_BASE_URL: JSON.stringify('http://test/api'), MOCK_LOGIN_CODE: JSON.stringify('test-user'),
} })
```

### Task 2 · 状态、登录与 JSON 请求

```ts
// apps/miniapp/src/stores/auth.ts
import { create } from 'zustand'
import Taro from '@tarojs/taro'
import type { LoginResponse, UserView } from '@should-quit/shared'
interface AuthState {
  token: string; user: UserView | null; hasBaseline: boolean
  setLogin(value: LoginResponse): void; setBaseline(value: boolean): void
}
export const useAuth = create<AuthState>(set => ({
  token: Taro.getStorageSync('token') || '', user: null, hasBaseline: false,
  setLogin: value => { Taro.setStorageSync('token', value.token); set(value) },
  setBaseline: hasBaseline => set({ hasBaseline }),
}))
```

```ts
// apps/miniapp/src/stores/score.ts
import { create } from 'zustand'
import type { ScoreView } from '@should-quit/shared'
export const useScore = create<{ score: ScoreView | null; setScore(score: ScoreView | null): void }>(set => ({
  score: null, setScore: score => set({ score }),
}))
```

```ts
// apps/miniapp/src/services/auth.ts
import Taro from '@tarojs/taro'
import type { LoginResponse } from '@should-quit/shared'
import { useAuth } from '../stores/auth'
import { useScore } from '../stores/score'
import { useChat } from '../stores/chat'
let pending: Promise<LoginResponse> | undefined
export function login(): Promise<LoginResponse> {
  if (pending) return pending
  pending = (async () => {
    const { code } = await Taro.login()
    const r = await Taro.request<LoginResponse>({ url: API_BASE_URL + '/auth/login', method: 'POST',
      data: { code: MOCK_LOGIN_CODE || code } })
    if (r.statusCode !== 200) throw new Error('登录失败')
    const oldUser = useAuth.getState().user
    if (!oldUser || oldUser.id !== r.data.user.id) { useScore.getState().setScore(null); useChat.getState().reset() }
    useAuth.getState().setLogin(r.data)
    return r.data
  })().catch(error => { void Taro.showToast({ title: '登录失败，请重试', icon: 'none' }); throw error })
    .finally(() => { pending = undefined })
  return pending
}
export async function ensureLogin(): Promise<LoginResponse> {
  const state = useAuth.getState()
  if (state.token && state.user) return { token: state.token, user: state.user, hasBaseline: state.hasBaseline }
  return login()
}
export async function guardPage(): Promise<boolean> {
  const state = await ensureLogin()
  if (!state.hasBaseline) { await goBaseline(); return false }
  return true
}
let routing: Promise<unknown> | undefined
export function goBaseline(): Promise<unknown> {
  if (!routing) routing = Taro.reLaunch({ url: '/pages/baseline/index' }).finally(() => { routing = undefined })
  return routing
}
```

```ts
// apps/miniapp/src/services/request.ts
import Taro from '@tarojs/taro'
import { isErrorBody } from '@should-quit/shared'
import { useAuth } from '../stores/auth'
import { ensureLogin, goBaseline, login } from './auth'
export interface RequestOptions { method?: 'GET' | 'POST' | 'PUT'; data?: unknown }
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
export function responseError(status: number, data: unknown): ApiError {
  return new ApiError(status, isErrorBody(data) ? data.code : 'INTERNAL_ERROR',
    isErrorBody(data) ? data.message : '请求失败，请稍后重试')
}
export async function reportError(error: ApiError): Promise<never> {
  if (error.code === 'BASELINE_REQUIRED') { useAuth.getState().setBaseline(false); await goBaseline() }
  else await Taro.showToast({ title: error.message, icon: 'none' })
  throw error
}
export async function refreshAfter401(sentToken: string): Promise<void> {
  // 另一个并发请求已经换好token时，无需再次登录。
  if (useAuth.getState().token === sentToken) await login()
}
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  await ensureLogin()
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = useAuth.getState().token
    let r: Taro.request.SuccessCallbackResult<T>
    try {
      r = await Taro.request<T>({ url: API_BASE_URL + path, method: options.method ?? 'GET',
        data: options.data, header: { Authorization: 'Bearer ' + token } })
    } catch {
      return reportError(new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请重试'))
    }
    if (r.statusCode >= 200 && r.statusCode < 300) return r.data
    if (r.statusCode === 401 && attempt === 0) { await refreshAfter401(token); continue }
    return reportError(responseError(r.statusCode, r.data))
  }
  throw new Error('unreachable')
}
```

```ts
// apps/miniapp/src/services/api.ts
import type { BaselineBody, BaselineResponse, ScoreView, MoodCreateBody, MoodDailyItem, MoodItem,
  TrendRange, TrendResponse, ConversationView, MessageView, AgentConfigView } from '@should-quit/shared'
import { request } from './request'
export const api = {
  baseline: () => request<BaselineResponse>('/baseline'),
  saveBaseline: (data: BaselineBody) => request<ScoreView>('/baseline', { method: 'PUT', data }),
  score: () => request<ScoreView>('/score/current'),
  checkin: (data: MoodCreateBody) => request<ScoreView>('/moods', { method: 'POST', data }),
  daily: (days = 90) => request<MoodDailyItem[]>(`/moods/daily?days=${days}`),
  moods: (date: string) => request<MoodItem[]>(`/moods?date=${encodeURIComponent(date)}`),
  trend: (range: TrendRange) => request<TrendResponse>(`/score/trend?range=${range}`),
  conversations: () => request<ConversationView[]>('/agent/conversations'),
  createConversation: () => request<ConversationView>('/agent/conversations', { method: 'POST' }),
  messages: (id: string) => request<MessageView[]>(`/agent/conversations/${encodeURIComponent(id)}/messages`),
  agentConfig: () => request<AgentConfigView>('/agent/config'),
}
```

```tsx
// apps/miniapp/src/pages/launch/index.tsx
import { useState } from 'react'
import Taro, { useLoad } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { ensureLogin } from '../../services/auth'
export default function Launch() {
  const [failed, setFailed] = useState(false)
  const start = async () => {
    setFailed(false)
    try {
      const state = await ensureLogin()
      if (state.hasBaseline) await Taro.switchTab({ url: '/pages/home/index' })
      else await Taro.reLaunch({ url: '/pages/baseline/index' })
    } catch { setFailed(true) }
  }
  useLoad(() => { void start() })
  return <View className='screen'>{failed ? <Button onClick={() => void start()}>登录失败，点击重试</Button> : '正在登录…'}</View>
}
```

### Task 3 · SSE 请求与聊天 store

```ts
// apps/miniapp/src/services/agent-stream.ts
import Taro from '@tarojs/taro'
import { Utf8StreamDecoder, SseParser, parseAgentEvent, type AgentEvent } from '@should-quit/shared'
import { useAuth } from '../stores/auth'
import { ensureLogin } from './auth'
import { refreshAfter401, reportError, responseError } from './request'
export function askStream(id: string, text: string, onEvent: (event: AgentEvent) => void) {
  let aborted = false, task: Taro.RequestTask | undefined
  const finished = (async () => {
    await ensureLogin()
    for (let attempt = 0; attempt < 2; attempt++) {
      if (aborted) throw new Error('连接已关闭')
      const token = useAuth.getState().token
      const result = await new Promise<{ status: number; data?: unknown; sse: boolean }>((resolve, reject) => {
        const decoder = new Utf8StreamDecoder(), parser = new SseParser()
        let headers = false, sse = false, terminal = false, status = 0, json = '', bytes = false
        const early: Uint8Array[] = []
        const parseText = (value: string) => {
          for (const frame of parser.push(value)) {
            const event = parseAgentEvent(frame)
            if (!event || terminal) continue
            onEvent(event)
            if (event.type === 'done' || event.type === 'error') terminal = true
          }
        }
        const consume = (chunk: Uint8Array) => {
          const value = decoder.push(chunk)
          if (sse) parseText(value); else json += value
        }
        task = Taro.request({
          url: `${API_BASE_URL}/agent/conversations/${encodeURIComponent(id)}/messages`, method: 'POST',
          data: { text }, header: { Authorization: 'Bearer ' + token }, enableChunked: true, timeout: 320000,
          success: r => {
            status = status || r.statusCode
            if (!headers) {
              // 老基础库缺headers回调不猜测为SSE，返回升级提示。
              reject(new Error('请升级微信后使用顾问')); return
            }
            const tail = decoder.flush()
            if (sse) {
              parseText(tail)
              if (!terminal) { reject(new Error('回答中断，点此重试')); return }
              resolve({ status, sse: true })
            } else {
              json += tail
              try { resolve({ status, sse: false, data: bytes ? JSON.parse(json) : r.data }) }
              catch { reject(new Error('服务返回格式无效')) }
            }
          },
          fail: () => reject(new Error('回答中断，点此重试')),
        })
        task.onHeadersReceived(r => {
          if (headers) return
          headers = true; status = r.statusCode
          const pair = Object.entries(r.header).find(([key]) => key.toLowerCase() === 'content-type')
          sse = status === 200 && String(pair?.[1]).toLowerCase().includes('text/event-stream')
          for (const chunk of early.splice(0)) consume(chunk)
        })
        task.onChunkReceived(r => {
          if (aborted) return
          bytes = true
          const chunk = new Uint8Array(r.data)
          if (headers) consume(chunk); else early.push(chunk)
        })
      })
      if (result.sse) return
      if (result.status === 401 && attempt === 0) { await refreshAfter401(token); continue }
      return reportError(responseError(result.status, result.data))
    }
  })()
  return { finished, abort: () => { aborted = true; task?.abort() } }
}
```

```ts
// apps/miniapp/src/stores/chat.ts
import { create } from 'zustand'
import type { AgentEvent, MessageView } from '@should-quit/shared'
export interface ChatTurn {
  key: number; question: string; answer: string; tools: string[]
  state: 'pending' | 'complete' | 'failed' | 'interrupted'; messageId?: string
}
interface Session { history: MessageView[]; turns: ChatTurn[] }
interface ChatState {
  sessions: Record<string, Session>
  reset(): void; setHistory(id: string, messages: MessageView[]): void
  start(id: string, question: string): number
  event(id: string, key: number, event: AgentEvent): void
  interrupt(id: string, key: number): void
}
let serial = 0
export const useChat = create<ChatState>((set, get) => ({
  sessions: {}, reset: () => set({ sessions: {} }),
  setHistory: (id, history) => set(s => ({ sessions: { ...s.sessions,
    [id]: { history, turns: [] } } })),
  start: (id, question) => {
    const session = get().sessions[id] ?? { history: [], turns: [] }
    if (session.turns.some(t => t.state === 'pending')) throw new Error('正在回答')
    const key = ++serial
    set(s => ({ sessions: { ...s.sessions, [id]: { ...session, turns: [...session.turns,
      { key, question, answer: '', tools: [], state: 'pending' }] } } }))
    return key
  },
  event: (id, key, event) => set(s => {
    const session = s.sessions[id]
    if (!session) return s
    return { sessions: { ...s.sessions, [id]: { ...session, turns: session.turns.map(t => {
      if (t.key !== key || t.state !== 'pending') return t
      if (event.type === 'delta') return { ...t, answer: t.answer + event.text }
      if (event.type === 'tool') return { ...t, tools: [...t.tools, event.label] }
      if (event.type === 'done') return { ...t, state: 'complete', messageId: event.messageId }
      return { ...t, state: event.code === 'AGENT_TIMEOUT' ? 'interrupted' : 'failed' }
    }) } } }
  }),
  interrupt: (id, key) => set(s => {
    const session = s.sessions[id]
    if (!session) return s
    return { sessions: { ...s.sessions, [id]: { ...session, turns: session.turns.map(t =>
      t.key === key && t.state === 'pending' ? { ...t, state: 'interrupted' } : t) } } }
  }),
}))
```

### Task 4 · 问卷和首页

```ts
// apps/miniapp/src/pages/baseline/model.ts
import { BASELINE_FIELDS, objectiveScore, type BaselineInput } from '@should-quit/shared'
export function previewBaseline(draft: Partial<BaselineInput>) {
  const baseline = Object.fromEntries(BASELINE_FIELDS.map(f => [f, draft[f] ?? 3])) as BaselineInput
  return { score: objectiveScore(baseline).score, complete: BASELINE_FIELDS.every(f => draft[f] !== undefined) }
}
```

```tsx
// apps/miniapp/src/components/baseline-question/index.tsx
import { Button, Text, View } from '@tarojs/components'
import type { BaselineQuestion, Level } from '@should-quit/shared'
export default function BaselineQuestionView({ question, value, onChange }: {
  question: BaselineQuestion; value?: Level; onChange(value: Level): void
}) {
  return <View className='card'><View className='title'>{question.title}</View><Text className='muted'>{question.hint}</Text>
    {question.options.map(option => <Button key={option.level} className={'option ' + (option.level === value ? 'selected' : '')}
      onClick={() => onChange(option.level)}>{option.label}</Button>)}</View>
}
```

```tsx
// apps/miniapp/src/components/mood-stars/index.tsx
import { Button, View } from '@tarojs/components'
export default function MoodStars({ value, onChange }: { value: number; onChange(value: number): void }) {
  const labels = ['很差', '较差', '一般', '不错', '很好']
  return <View className='stars'>{labels.map((label, i) => <Button key={i}
    aria-label={`${i + 1}星，${label}`} onClick={() => onChange(i + 1)}>{i < value ? '★' : '☆'}</Button>)}</View>
}
```

```tsx
// apps/miniapp/src/components/score-card/index.tsx
import { useState } from 'react'
import { Button, View } from '@tarojs/components'
import type { ScoreView } from '@should-quit/shared'
export default function ScoreCard({ score }: { score: ScoreView }) {
  const [open, setOpen] = useState(false)
  return <View className='card'><View className='score'>{score.totalScore}</View>
    <View>{score.copy.label}</View><View>{score.copy.slogan}</View>
    <View className='muted'>客观 {score.objectiveScore} · 心情 {score.moodScore ?? '暂无，去打卡'}</View>
    <Button onClick={() => setOpen(!open)}>{open ? '收起建议' : '查看详细建议'}</Button>
    {open && <View>{score.copy.guidance}</View>}</View>
}
```

```tsx
// apps/miniapp/src/pages/baseline/index.tsx
import { useRef, useState } from 'react'
import Taro, { useLoad } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { BASELINE_OPTIONS, baselineSchema, type BaselineInput } from '@should-quit/shared'
import { api } from '../../services/api'
import { ensureLogin } from '../../services/auth'
import { useAuth } from '../../stores/auth'
import { useScore } from '../../stores/score'
import Question from '../../components/baseline-question'
import { previewBaseline } from './model'
export default function Baseline() {
  const [draft, setDraft] = useState<Partial<BaselineInput>>({}), [index, setIndex] = useState<number | null>(0)
  const [editing, setEditing] = useState(false), [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false)
  const busy = useRef(false)
  useLoad(() => { void (async () => {
    await ensureLogin()
    const { baseline } = await api.baseline()
    if (baseline) { setDraft(baseline as BaselineInput); setEditing(true); setIndex(null) }
    setLoaded(true)
  })().catch(() => {}) })
  const preview = previewBaseline(draft)
  const save = async () => {
    if (busy.current || !preview.complete) return
    const parsed = baselineSchema.parse(draft)
    busy.current = true; setSaving(true)
    try {
      const score = await api.saveBaseline(parsed)
      useScore.getState().setScore(score); useAuth.getState().setBaseline(true)
      if (editing) setIndex(null)
      else await Taro.switchTab({ url: '/pages/home/index' })
    } catch { /* request已经提示；保留draft */ }
    finally { busy.current = false; setSaving(false) }
  }
  if (!loaded) return <View>正在读取基准…</View>
  const q = index === null ? undefined : BASELINE_OPTIONS[index]
  return <View className='screen'>
    {q && <><View>{index! + 1} / 8</View><Question question={q} value={draft[q.field]} onChange={level => {
      setDraft(old => ({ ...old, [q.field]: level }))
      if (!editing && index! < 7) setIndex(index! + 1)
    }} />
    {!editing && index! > 0 && <Button onClick={() => setIndex(index! - 1)}>上一项</Button>}</>}
    {index === null && BASELINE_OPTIONS.map((question, i) => <Button key={question.field} onClick={() => setIndex(i)}>
      {question.title}：{question.options.find(o => o.level === draft[question.field])?.label ?? '未填'}</Button>)}
    <View>客观分预览 {preview.score}</View>{!preview.complete && <View className='muted'>未填项暂按一般预览</View>}
    <Button className='primary' disabled={!preview.complete || saving} loading={saving} onClick={() => void save()}>保存</Button>
    {editing && index !== null && <Button onClick={() => setIndex(null)}>返回总览</Button>}
  </View>
}
```

```tsx
// apps/miniapp/src/pages/home/index.tsx
import { useRef, useState } from 'react'
import { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { Button, Textarea, View } from '@tarojs/components'
import { localDate, moodCreateSchema } from '@should-quit/shared'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
import { useScore } from '../../stores/score'
import MoodStars from '../../components/mood-stars'
import ScoreCard from '../../components/score-card'
export default function Home() {
  const score = useScore(s => s.score)
  const [stars, setStars] = useState(0), [note, setNote] = useState(''), [count, setCount] = useState(0)
  const [saving, setSaving] = useState(false), [error, setError] = useState(false)
  const busy = useRef(false), version = useRef(0), today = useRef('')
  const refresh = async () => {
    const v = ++version.current, date = localDate(new Date()); today.current = date
    try {
      if (!await guardPage()) return
      const [value, moods] = await Promise.all([api.score(), api.moods(date)])
      if (v !== version.current || today.current !== date) return
      useScore.getState().setScore(value); setCount(moods.length); setError(false)
    } catch { setError(true) }
  }
  useDidShow(() => { void refresh() })
  useShareAppMessage(() => ({ title: score?.copy.slogan ?? '该溜吗', path: '/pages/launch/index' }))
  const submit = async () => {
    if (busy.current || stars === 0) return
    const parsed = moodCreateSchema.safeParse({ stars, note })
    if (!parsed.success) return
    busy.current = true; setSaving(true); ++version.current
    try {
      const result = await api.checkin(parsed.data)
      useScore.getState().setScore(result)
      const date = localDate(new Date())
      if (today.current === date) setCount(n => n + 1)
      else { today.current = date; setCount((await api.moods(date)).length) }
      setStars(0); setNote('')
    } catch { /* 保留输入 */ }
    finally { busy.current = false; setSaving(false) }
  }
  return <View className='screen'><View className='card'><View className='title'>此刻上班心情？</View>
    <MoodStars value={stars} onChange={setStars} /><Textarea className='note' maxlength={200} value={note}
      placeholder='一句话记录（选填）' onInput={e => setNote(e.detail.value)} />
    <Button className='primary' disabled={!stars || saving} loading={saving} onClick={() => void submit()}>打卡</Button>
    <View className='muted'>今日已打卡 {count} 次</View></View>
    {score && <ScoreCard score={score} />}{error && <Button onClick={() => void refresh()}>加载失败，重试</Button>}</View>
}
```

```tsx
// apps/miniapp/src/pages/mine/index.tsx
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { guardPage } from '../../services/auth'
export default function Mine() {
  useDidShow(() => { void guardPage().catch(() => {}) })
  return <View className='screen'><Button onClick={() => void Taro.navigateTo({ url: '/pages/baseline/index' })}>编辑基准</Button>
    <View className='card'><View className='title'>免责声明</View>评分仅供自我观察，不构成离职、法律或财务建议。请结合收入、机会与个人处境审慎决定。</View>
    <View className='card'><View className='title'>关于该溜吗</View>记录工作条件与心情变化，帮助你看清自己的感受。</View></View>
}
```

### Task 5 · 图表几何、Canvas、日历和趋势页

```ts
// apps/miniapp/src/components/trend-chart/geometry.ts
import { daysBetween, shiftDate, type TrendResponse } from '@should-quit/shared'
export interface TrendRow { date: string; score: number | null }
export interface ChartPoint extends TrendRow { x: number; y: number | null }
export function fillTrend(data: TrendResponse, start: string, end: string): TrendRow[] {
  const count = daysBetween(start, end) + 1
  if (count < 1 || count > 90) throw new Error('invalid range')
  const byDate = new Map(data.items.map(item => [item.date, item.totalScore]))
  let score = data.before?.totalScore ?? null
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDate(start, i)
    if (byDate.has(date)) score = byDate.get(date)!
    return { date, score }
  })
}
export function chartPoints(rows: TrendRow[], width: number, height: number): ChartPoint[] {
  const w = Math.max(0, width - 44), h = Math.max(0, height - 36)
  return rows.map((row, i) => ({ ...row, x: 32 + (rows.length === 1 ? w / 2 : i / (rows.length - 1) * w),
    y: row.score === null ? null : 12 + (100 - row.score) / 100 * h }))
}
export function nearestPoint(points: ChartPoint[], x: number): ChartPoint | null {
  return points.reduce<ChartPoint | null>((best, point) => point.score === null ? best
    : !best || Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, null)
}
export function trendSummary(rows: TrendRow[]): string {
  const values = rows.filter(row => row.score !== null)
  if (!values.length) return '这段时间暂无评分记录'
  if (values.length === 1) return `${values[0]!.date}：${values[0]!.score}分`
  return `${values[0]!.date}至${values.at(-1)!.date}，从${values[0]!.score}分到${values.at(-1)!.score}分`
}
```

```tsx
// apps/miniapp/src/components/trend-chart/index.tsx
import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Canvas, View } from '@tarojs/components'
import { chartPoints, nearestPoint, trendSummary, type ChartPoint, type TrendRow } from './geometry'
interface CanvasNode { width: number; height: number; getContext(type: '2d'): CanvasRenderingContext2D }
export default function TrendChart({ rows }: { rows: TrendRow[] }) {
  const [selected, setSelected] = useState<ChartPoint | null>(null)
  const points = useRef<ChartPoint[]>([]), left = useRef(0)
  useEffect(() => {
    let cancelled = false
    Taro.nextTick(() => {
      Taro.createSelectorQuery().select('#trend-canvas').fields({ node: true, size: true, rect: true }).exec(result => {
        if (cancelled) return
        const rect = result[0] as { node: CanvasNode; width: number; height: number; left: number } | undefined
        if (!rect?.node) return
        left.current = rect.left
        const { node, width, height } = rect
        const ratio = Taro.getSystemInfoSync().pixelRatio
        node.width = width * ratio; node.height = height * ratio
        const ctx = node.getContext('2d'); ctx.scale(ratio, ratio)
        ctx.clearRect(0, 0, width, height)
        const y = (score: number) => 12 + (100 - score) / 100 * (height - 36)
        const bands = [[0, 20, '#fce6e6'], [20, 60, '#fff0dc'], [60, 80, '#fffadd'], [80, 100, '#e6f3e2']] as const
        for (const [min, max, color] of bands) { ctx.fillStyle = color; ctx.fillRect(32, y(max), width - 44, y(min) - y(max)) }
        ctx.font = '11px sans-serif'; ctx.fillStyle = '#333'
        for (const score of [0, 20, 60, 80, 100]) ctx.fillText(String(score), 2, y(score) + 4)
        const ps = chartPoints(rows, width, height); points.current = ps
        ctx.strokeStyle = '#8a4b00'; ctx.fillStyle = '#8a4b00'; ctx.lineWidth = 2
        let started = false
        ctx.beginPath()
        for (const p of ps) {
          if (p.y === null) { started = false; continue }
          if (!started) { ctx.moveTo(p.x, p.y); started = true } else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
        for (const p of ps) if (p.y !== null) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill() }
        setSelected(null)
      })
    })
    return () => { cancelled = true }
  }, [rows])
  return <View><Canvas id='trend-canvas' type='2d' style={{ width: '100%', height: '220px' }}
    onTouchEnd={e => {
      const touch = e.changedTouches[0]
      if (touch) setSelected(nearestPoint(points.current, touch.clientX - left.current))
    }} />
    {selected && <View>{selected.date}：{selected.score}分</View>}
    <View className='muted'>{trendSummary(rows)}</View></View>
}
```

```ts
// apps/miniapp/src/components/mood-calendar/calendar.ts
import { shiftDate, type MoodDailyItem } from '@should-quit/shared'
export function moodColor(avg: number | null): string {
  if (avg === null) return 'gray'
  return avg <= 25 ? 'red' : avg <= 50 ? 'orange' : avg <= 75 ? 'yellow' : 'green'
}
export interface MonthCell { date: string; avg: number | null; count: number }
export function monthCells(month: string, daily: MoodDailyItem[]): Array<MonthCell | null> {
  const first = month + '-01', byDate = new Map(daily.map(d => [d.date, d]))
  const weekday = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7
  const cells: Array<MonthCell | null> = Array.from({ length: weekday }, () => null)
  for (let date = first; date.startsWith(month + '-'); date = shiftDate(date, 1)) {
    const item = byDate.get(date)
    cells.push({ date, avg: item?.avg ?? null, count: item?.count ?? 0 })
  }
  while (cells.length % 7) cells.push(null)
  return cells
}
export function shiftMonth(month: string, by: number): string {
  const date = new Date(month + '-01T00:00:00Z')
  date.setUTCMonth(date.getUTCMonth() + by)
  return date.toISOString().slice(0, 7)
}
```

```tsx
// apps/miniapp/src/components/mood-calendar/index.tsx
import { Button, View } from '@tarojs/components'
import { shiftDate, type MoodDailyItem } from '@should-quit/shared'
import { moodColor, monthCells, shiftMonth } from './calendar'
export default function MoodCalendar({ month, today, daily, onMonth, onDate }: {
  month: string; today: string; daily: MoodDailyItem[]; onMonth(value: string): void; onDate(date: string): void
}) {
  const since = shiftDate(today, -89), firstMonth = since.slice(0, 7), lastMonth = today.slice(0, 7)
  return <View className='card'><View className='row'>
    <Button disabled={month <= firstMonth} onClick={() => onMonth(shiftMonth(month, -1))}>上一月</Button>
    <View>{month}</View><Button disabled={month >= lastMonth} onClick={() => onMonth(shiftMonth(month, 1))}>下一月</Button></View>
    <View className='muted'>可查看最近90天；红低绿高，灰色未打卡</View>
    <View className='calendar'>{['一', '二', '三', '四', '五', '六', '日'].map(day => <View key={day}>{day}</View>)}
      {monthCells(month, daily).map((cell, i) => cell ? <Button key={cell.date}
        className={'day ' + moodColor(cell.avg)} disabled={cell.date < since || cell.date > today}
        aria-label={`${cell.date}，${cell.date < since ? '超出可查看范围' : cell.avg === null ? '未打卡' : `日均${cell.avg}分，${cell.count}次`}`}
        onClick={() => onDate(cell.date)}>{Number(cell.date.slice(-2))}</Button> : <View key={'blank-' + i} />)}</View>
  </View>
}
```

```tsx
// apps/miniapp/src/pages/trend/index.tsx
import { useRef, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import { localDate, shiftDate, TREND_RANGE_DAYS, type TrendRange, type MoodDailyItem, type MoodItem } from '@should-quit/shared'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
import TrendChart from '../../components/trend-chart'
import { fillTrend, type TrendRow } from '../../components/trend-chart/geometry'
import MoodCalendar from '../../components/mood-calendar'
export default function Trend() {
  const [range, setRange] = useState<TrendRange>('30d'), [rows, setRows] = useState<TrendRow[]>([])
  const [daily, setDaily] = useState<MoodDailyItem[]>([]), [today, setToday] = useState(localDate(new Date()))
  const [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState('')
  const [details, setDetails] = useState<MoodItem[]>([]), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [detailError, setDetailError] = useState(false)
  const version = useRef(0), detailVersion = useRef(0)
  const load = async (nextRange: TrendRange) => {
    const v = ++version.current, date = localDate(new Date()); setRange(nextRange); setToday(date)
    try {
      if (!await guardPage()) return
      const [trend, daily] = await Promise.all([api.trend(nextRange), api.daily(90)])
      if (v !== version.current) return
      setRows(fillTrend(trend, shiftDate(date, -(TREND_RANGE_DAYS[nextRange] - 1)), date)); setDaily(daily); setFailed(false)
    } catch { if (v === version.current) setFailed(true) }
  }
  const show = async (date: string) => {
    const v = ++detailVersion.current; setSelected(date); setLoading(true); setDetails([]); setDetailError(false)
    try { const items = await api.moods(date); if (v === detailVersion.current) setDetails(items) }
    catch { if (v === detailVersion.current) setDetailError(true) }
    finally { if (v === detailVersion.current) setLoading(false) }
  }
  useDidShow(() => { void load(range) })
  return <View className='screen'><View className='row'>{(['7d', '30d', '90d'] as const).map(r =>
    <Button key={r} className={range === r ? 'selected' : ''} onClick={() => void load(r)}>{r.slice(0, -1)}天</Button>)}</View>
    <View className='card'><TrendChart rows={rows} /></View>
    {failed && <Button onClick={() => void load(range)}>加载失败，重试</Button>}
    <MoodCalendar month={month} today={today} daily={daily} onMonth={setMonth} onDate={date => void show(date).catch(() => {})} />
    {selected && <View className='sheet'><View className='title'>{selected} 打卡明细</View>
      {loading ? '正在读取…' : detailError ? <Button onClick={() => void show(selected)}>读取失败，重试</Button> : details.length ? details.map(item => <View className='card' key={item.id}>
        <View>{localTime(item.createdAt)} {'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}</View><View>{item.note ?? '无备注'}</View>
      </View>) : '当天没有打卡'}
      <Button onClick={() => { ++detailVersion.current; setSelected('') }}>关闭</Button></View>}</View>
}
function localTime(iso: string) { return new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(11, 16) }
```

### Task 6 · 顾问与聊天页面

```tsx
// apps/miniapp/src/pages/advisor/index.tsx
import { useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import type { ConversationView } from '@should-quit/shared'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
export default function Advisor() {
  const [items, setItems] = useState<ConversationView[]>([]), [failed, setFailed] = useState(false)
  const creating = useRef(false), version = useRef(0)
  const load = async () => {
    const v = ++version.current
    try { if (await guardPage()) { const rows = await api.conversations(); if (v === version.current) { setItems(rows); setFailed(false) } } }
    catch { setFailed(true) }
  }
  const open = (id: string) => Taro.navigateTo({ url: '/pages/chat/index?id=' + encodeURIComponent(id) })
  const create = async () => {
    if (creating.current) return
    creating.current = true
    try { const c = await api.createConversation(); await open(c.id) } catch {} finally { creating.current = false }
  }
  useDidShow(() => { void load() })
  return <View className='screen'><Button className='primary' onClick={() => void create()}>新建会话</Button>
    {failed && <Button onClick={() => void load()}>读取失败，重试</Button>}
    {items.map(c => <Button key={c.id} onClick={() => void open(c.id)}>{c.title ?? '新会话'}</Button>)}
    {!items.length && !failed && <View className='muted'>还没有会话，问问“我该溜吗？”</View>}</View>
}
```

```tsx
// apps/miniapp/src/pages/chat/index.tsx
import { useRef, useState } from 'react'
import Taro, { useLoad, useUnload } from '@tarojs/taro'
import { Button, Textarea, View } from '@tarojs/components'
import { askSchema, type MessageView } from '@should-quit/shared'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
import { askStream } from '../../services/agent-stream'
import { ApiError } from '../../services/request'
import { useChat } from '../../stores/chat'
export default function Chat() {
  const [id, setId] = useState(''), [draft, setDraft] = useState(''), [presets, setPresets] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const session = useChat(s => s.sessions[id]), active = useRef<ReturnType<typeof askStream>>()
  const alive = useRef(true), sending = useRef(false)
  const load = async (conversationId: string) => {
    if (!await guardPage()) return
    const [messages, config] = await Promise.all([api.messages(conversationId), api.agentConfig()])
    if (!alive.current) return
    // 重新进入页面时以服务端历史为准；本次页面内工具行由turn持有。
    useChat.getState().setHistory(conversationId, messages); setPresets(config.presetQuestions); setFailed(false)
  }
  useLoad(query => {
    const conversationId = query.id
    if (!conversationId) { setFailed(true); return }
    setId(conversationId); void load(conversationId).catch(() => setFailed(true))
  })
  useUnload(() => { alive.current = false; active.current?.abort() })
  const send = async (text: string) => {
    const parsed = askSchema.safeParse({ text })
    if (!parsed.success || sending.current || !id) return
    sending.current = true
    const key = useChat.getState().start(id, parsed.data.text)
    setDraft('')
    const handle = askStream(id, parsed.data.text, event => {
      if (alive.current) useChat.getState().event(id, key, event)
    })
    active.current = handle
    try { await handle.finished }
    catch (error) {
      useChat.getState().interrupt(id, key)
      if (alive.current && error instanceof ApiError && error.code === 'AGENT_BUSY') {
        await Taro.showModal({ title: '上一条回答尚未结束', content: '上一条回答还在后台收尾，稍等片刻再试，或新开一个会话', showCancel: false })
      }
    } finally { sending.current = false; active.current = undefined }
  }
  const pending = session?.turns.some(t => t.state === 'pending') ?? false
  return <View className='screen'>
    {failed && <Button onClick={() => void load(id).catch(() => setFailed(true))}>加载失败，重试</Button>}
    {!session?.history.length && !session?.turns.length && presets.map(text => <Button key={text} onClick={() => void send(text)}>{text}</Button>)}
    {session?.history.map((message, index) => <View key={message.id}>
      <View className={'bubble ' + (message.role === 'USER' ? 'user' : 'assistant')}>{message.content}</View>
      {message.role === 'ASSISTANT' && message.status !== 'COMPLETE' && <Button disabled={pending}
        onClick={() => { const question = previousQuestion(session.history, index); if (question) void send(question) }}>回答中断，点此重试</Button>}
    </View>)}
    {session?.turns.map(turn => <View key={turn.key}><View className='bubble user'>{turn.question}</View>
      {turn.tools.map((label, i) => <View className='muted' key={i}>{label}</View>)}
      <View className='bubble assistant'>{turn.answer || (turn.state === 'pending' ? '正在思考…' : '未收到回答')}</View>
      {(turn.state === 'failed' || turn.state === 'interrupted') && <Button disabled={pending} onClick={() => void send(turn.question)}>回答中断，点此重试</Button>}
    </View>)}
    <View className='chat-input'><Textarea className='note' maxlength={500} value={draft} placeholder='问点什么…'
      onInput={e => setDraft(e.detail.value)} /><Button className='primary' disabled={pending || !draft.trim()} onClick={() => void send(draft)}>发送</Button></View>
  </View>
}
function previousQuestion(messages: MessageView[], index: number): string | undefined {
  return messages.slice(0, index).reverse().find(m => m.role === 'USER')?.content
}
```

七个页面的 `index.config.ts` 内容分别为以下模板，标题替换为启动/工作基准/首页/趋势/顾问/聊天/我的；只有首页开启分享。

```ts
export default definePageConfig({ navigationBarTitleText: '首页', enableShareAppMessage: true })
```

### Task 1/4/5 · 纯函数与配置测试

```ts
// apps/miniapp/test/trend.test.ts
import { expect, it } from 'vitest'
import { fillTrend, chartPoints, nearestPoint } from '../src/components/trend-chart/geometry'
import { monthCells, moodColor, shiftMonth } from '../src/components/mood-calendar/calendar'
import type { TrendPoint } from '@should-quit/shared'
const p = (date: string, totalScore: number): TrendPoint => ({ date, totalScore, tier: 'SEEK', objectiveScore: totalScore, moodScore: null })
it('only fills forward from known data', () => {
  expect(fillTrend({ before: p('2026-10-30', 47), items: [p('2026-11-02', 50)] }, '2026-11-01', '2026-11-03').map(x => x.score)).toEqual([47, 50, 50])
  expect(fillTrend({ before: null, items: [p('2026-11-02', 50)] }, '2026-11-01', '2026-11-03').map(x => x.score)).toEqual([null, 50, 50])
})
it('single point and null nearest', () => {
  const ps = chartPoints([{ date: '2026-11-01', score: 100 }], 244, 136)
  expect(ps[0]).toMatchObject({ x: 132, y: 12 })
  expect(nearestPoint(ps, -100)?.score).toBe(100)
  expect(nearestPoint(chartPoints([{ date: '2026-11-01', score: null }], 244, 136), 0)).toBeNull()
})
it('leap month and continuous decimal thresholds', () => {
  expect(monthCells('2028-02', []).filter(Boolean)).toHaveLength(29)
  expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  expect([25, 25.01, 50, 50.01, 75, 75.01].map(moodColor)).toEqual(['red', 'orange', 'orange', 'yellow', 'yellow', 'green'])
})
```

```ts
// apps/miniapp/test/baseline-home.test.ts
import { expect, it } from 'vitest'
import { BASELINE_FIELDS, BASELINE_OPTIONS, type BaselineInput } from '@should-quit/shared'
import { previewBaseline } from '../src/pages/baseline/model'
it('explicit eight answers required, preview is deterministic', () => {
  expect(previewBaseline({})).toEqual({ score: 50, complete: false })
  const all = (n: 1 | 5) => Object.fromEntries(BASELINE_FIELDS.map(f => [f, n])) as BaselineInput
  expect(previewBaseline(all(1))).toEqual({ score: 0, complete: true })
  expect(previewBaseline(all(5))).toEqual({ score: 100, complete: true })
  expect(BASELINE_OPTIONS.find(q => q.field === 'overtime')!.options[0]!.level).toBe(5)
})
```

```ts
// apps/miniapp/test/config.test.ts
import { expect, it, vi } from 'vitest'
it('seven routes, four tabs and 320s request timeout', async () => {
  vi.stubGlobal('defineAppConfig', (value: unknown) => value)
  const { default: config } = await import('../src/app.config')
  expect(config.pages).toHaveLength(7)
  expect(config.tabBar.list.map(t => t.text)).toEqual(['首页', '趋势', '顾问', '我的'])
  expect(config.networkTimeout.request).toBe(320000)
})
```

### Task 2 · 请求恢复测试

```ts
// apps/miniapp/test/request.test.ts
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ request: vi.fn(), login: vi.fn(), toast: vi.fn(), reLaunch: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: {
  request: mock.request, login: mock.login, showToast: mock.toast, reLaunch: mock.reLaunch,
  getStorageSync: () => '', setStorageSync: vi.fn(),
} }))
import { request } from '../src/services/request'
import { useAuth } from '../src/stores/auth'
beforeEach(() => {
  vi.clearAllMocks()
  useAuth.setState({ token: 'old', user: { id: 'a', nickname: null, avatarUrl: null }, hasBaseline: true })
  mock.login.mockResolvedValue({ code: 'code' }); mock.toast.mockResolvedValue({}); mock.reLaunch.mockResolvedValue({})
})
it('concurrent 401 refreshes once and retries with new token', async () => {
  mock.request.mockImplementation(async (options: { url: string; header?: { Authorization: string } }) => {
    if (options.url.endsWith('/auth/login')) return { statusCode: 200, data: {
      token: 'new', user: { id: 'a', nickname: null, avatarUrl: null }, hasBaseline: true,
    } }
    return options.header?.Authorization === 'Bearer old'
      ? { statusCode: 401, data: { code: 'UNAUTHORIZED', message: '过期' } }
      : { statusCode: 200, data: { ok: true } }
  })
  expect(await Promise.all([request('/score/current'), request('/score/current')])).toEqual([{ ok: true }, { ok: true }])
  expect(mock.login).toHaveBeenCalledTimes(1)
})
it('login 401 stops, never recursively calls request recovery', async () => {
  useAuth.setState({ token: '', user: null })
  mock.request.mockResolvedValue({ statusCode: 401, data: { code: 'WECHAT_LOGIN_FAILED', message: '失败' } })
  await expect(request('/score/current')).rejects.toThrow('登录失败')
  expect(mock.login).toHaveBeenCalledTimes(1)
})
it('baseline error routes and retains the error code', async () => {
  mock.request.mockResolvedValue({ statusCode: 409, data: { code: 'BASELINE_REQUIRED', message: '先录入' } })
  await expect(request('/score/current')).rejects.toMatchObject({ code: 'BASELINE_REQUIRED' })
  expect(mock.reLaunch).toHaveBeenCalledTimes(1)
})
```

### Task 3 · 分块测试（完整 mock RequestTask）

```ts
// apps/miniapp/test/agent-stream.test.ts
import { beforeEach, expect, it, vi } from 'vitest'
import { formatAgentEvent, type AgentEvent } from '@should-quit/shared'
const mock = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: { request: mock.request, getStorageSync: () => '', setStorageSync: vi.fn(),
  login: vi.fn(), showToast: vi.fn().mockResolvedValue({}), reLaunch: vi.fn().mockResolvedValue({}) } }))
import { askStream } from '../src/services/agent-stream'
import { useAuth } from '../src/stores/auth'
beforeEach(() => {
  useAuth.setState({ token: 'token', user: { id: 'a', nickname: null, avatarUrl: null }, hasBaseline: true })
})
function wire(status: number, type: string, bytes: Uint8Array[], early = false) {
  mock.request.mockImplementation((options: { success(r: unknown): void; fail(): void }) => {
    let headers: (r: unknown) => void, chunk: (r: unknown) => void
    queueMicrotask(() => {
      if (early) for (const b of bytes) chunk({ data: b.slice().buffer })
      headers({ statusCode: status, header: { 'Content-Type': type } })
      if (!early) for (const b of bytes) chunk({ data: b.slice().buffer })
      options.success({ statusCode: status, data: '' })
    })
    return { onHeadersReceived: (fn: typeof headers) => { headers = fn },
      onChunkReceived: (fn: typeof chunk) => { chunk = fn }, abort: () => options.fail() }
  })
}
it('all byte cuts preserve Chinese, ping and done', async () => {
  const expected: AgentEvent[] = [{ type: 'delta', text: '中文🙂' }, { type: 'done', messageId: 'm1' }]
  const bytes = new TextEncoder().encode(': ping\n\n' + expected.map(formatAgentEvent).join(''))
  for (let i = 1; i < bytes.length; i++) {
    wire(200, 'text/event-stream; charset=utf-8', [bytes.slice(0, i), bytes.slice(i)], i % 2 === 0)
    const events: AgentEvent[] = []
    await askStream('c', '问', event => events.push(event)).finished
    expect(events).toEqual(expected)
  }
})
it('non-SSE chunked error is reported as JSON and no agent event', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ code: 'RATE_LIMITED', message: '每小时最多30次' }))
  wire(429, 'application/json', [bytes.slice(0, 8), bytes.slice(8)])
  const onEvent = vi.fn()
  await expect(askStream('c', '问', onEvent).finished).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  expect(onEvent).not.toHaveBeenCalled()
})
it('EOF without terminal event is interrupted', async () => {
  wire(200, 'text/event-stream', [new TextEncoder().encode(formatAgentEvent({ type: 'delta', text: '部分' }))])
  await expect(askStream('c', '问', () => {}).finished).rejects.toThrow('回答中断')
})
```

```ts
// apps/miniapp/test/chat.test.ts
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@tarojs/taro', () => ({ default: { getStorageSync: () => '', setStorageSync: vi.fn() } }))
import { useChat } from '../src/stores/chat'
beforeEach(() => useChat.getState().reset())
it('tool rows survive completion and new retry does not overwrite old turn', () => {
  const chat = useChat.getState(), first = chat.start('a', '问')
  chat.event('a', first, { type: 'tool', name: 'get_score_summary', label: '正在查看你的评分' })
  chat.event('a', first, { type: 'delta', text: '部分' }); chat.interrupt('a', first)
  const next = chat.start('a', '问')
  chat.event('a', first, { type: 'delta', text: '迟到' })
  chat.event('a', next, { type: 'done', messageId: 'real-id' })
  const turns = useChat.getState().sessions.a!.turns
  expect(turns[0]).toMatchObject({ answer: '部分', state: 'interrupted', tools: ['正在查看你的评分'] })
  expect(turns[1]).toMatchObject({ state: 'complete', messageId: 'real-id' })
  expect(useChat.getState().sessions.b).toBeUndefined()
})
```

### Task 7 · 冒烟记录文件全文

保存为 `docs/miniapp-smoke.md`，执行人逐行填结果与证据；未执行保持未勾选。

```markdown
# 小程序验收记录

- 日期：
- 设备 / 微信版本 / 基础库：
- Server commit / Miniapp commit：
- AGENT_ENGINE / Spike报告：
- 合法HTTPS域名：

| 检查 | 预期 | 结果/证据 |
|---|---|---|
| 冷启动无token | 自动登录，按hasBaseline跳转 | 未执行 |
| 直接访问分享入口 | 登录与基准门槛生效 | 未执行 |
| 首次问卷 | 一屏一题，N/8，8项全部选后才能保存 | 未执行 |
| 编辑 | 总览→单项→保存回总览 | 未执行 |
| 首页 | 打卡区在上，分数卡在下，建议展开 | 未执行 |
| 断网打卡 | 星级和备注保留 | 未执行 |
| 北京时间午夜 | 今日次数刷新、不沿用昨天计数 | 未执行 |
| 趋势7/30/90天 | Canvas四档背景与0/20/60/80/100刻度，文字摘要 | 未执行 |
| 空趋势 | 不伪造0分或向前填分 | 未执行 |
| 日历 | 月翻页、日期数字、四色与灰色、有效日期弹明细 | 未执行 |
| 预设问题 | 新会话可点击立即发送 | 未执行 |
| 真机分块中文 | 中文/emoji无乱码，工具灰行保留 | 未执行 |
| 超时 | 保留部分回答，显示重试；后台未完仍busy | 未执行 |
| 重试 | 新USER记录，旧失败回答仍在 | 未执行 |
| 切页回聊天 | 读取历史，不自动重发POST | 未执行 |
| 401并发 | 登录一次、每请求最多重试一次 | 未执行 |
| 429/503 | 普通JSON提示，不按SSE解析 | 未执行 |
| 无障碍 | 星级标签、文字档位、44px点击区、4.5:1对比度 | 未执行 |
| 分享 | 标题为当前档位slogan | 未执行 |

- [ ] pnpm -r test
- [ ] pnpm -r typecheck
- [ ] pnpm --filter @should-quit/miniapp build:weapp
- [ ] fake完整主流程
- [ ] Spike选定真实引擎主流程
- [ ] 真机流输出
```

## 本轮补全后的联合评审

- DTO核对：GET baseline是 `{baseline}`，代码从该字段读取；ask文本上限500，note上限200，均直接使用shared schema。
- 构建核对：新增 `build` 与 `build:weapp` 两入口；普通CSS无Sass；`@types/react@18.3.26` 和 `@tarojs/plugin-framework-react@4.3.1` 已在本轮npm view核实。
- 图表核对：无before保持null、不向历史首点之前补分；坐标、触点、DPR、色带、刻度、摘要均有代码。日历小数分段连续，90天边界不伪装成未打卡。
- 页面核对：七页面齐全；首页打卡优先、基准一屏一项/编辑总览、趋势折线+日历、聊天气泡+工具灰行。
- 流核对：先头后块及先块后头均可处理；非SSE分块JSON只消费一次；仅明确401自动重发，网络中断不自动重发。微信RequestTask监听随请求结束释放；abort只断连接。
- 历史核对：setHistory清空该会话本地turn，防止重新进入时重复展示；回答结束当前页面保留工具行，重新进入使用MySQL展示历史。
- 测试边界：两份计划共66个TypeScript/TSX代码块已做语法解析检查；这不是完整类型检查、构建或真机验证。执行人仍需运行每个Task的验证步骤。

## 待同步到总览

- 新增CLI/webpack5-runner4.3.1，npm view已核实；CSS无需新增样式依赖。
- 现有daily接口仅允许最近90天，不能查询任意历史月份。MVP月翻页限制于最近90天并明确标注；如要无限历史需另改设计与后端契约，不能在前端伪造空白数据。
- 日均avg为小数，设计“26–50”等文案按连续分段理解为(25,50]；不先四舍五入。
- 首次未完成问卷的预览缺项暂按一般(level3)，有明确说明；提交仍必须全部显式选择。
- 工具行仅当前会话页面生命周期保留，MessageView未定义工具事件历史字段。

## 待同步到总览（本轮代码补充）

- miniapp新增精确依赖 `@types/react:18.3.26`；npm view已核实。
- 本地mock登录稳定身份用开发构建变量MOCK_LOGIN_CODE，生产构建强制空值；不在真实微信登录中复用code。
- 所有生产代码位于本文代码清单，当前只改实施计划；未实施任何页面或后端功能。

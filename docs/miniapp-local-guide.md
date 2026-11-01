# 该溜吗微信小程序本地操作手册

这份手册面向熟悉本地 Web 开发、第一次接触微信小程序的开发者。先在 Mac 上的微信开发者工具中打开「该溜吗」，完成一次基准录入和心情打卡，再考虑手机预览。

**打开界面的入口是微信开发者工具。`http://127.0.0.1:3000` 是后端服务，不是前端页面地址。** 当前仓库只配置了微信小程序构建，没有可直接在 Chrome 中打开的 H5 开发服务。

## 已经启动服务时的最快路径

你当前后端已在运行。如果前端构建也仍在监听，可以直接按这五步打开界面：

1. 安装并用微信登录开发者工具。
2. 准备自己有权限使用的小程序 AppID；注意下文的游客登录限制。
3. 导入 `/Users/panwei/Downloads/go/dsh/dsh-should-quit/apps/miniapp`。
4. 在项目本地设置中，启用本地调试跳过域名校验。
5. 点击「普通编译」，等待登录后完成问卷，进入首页。

如果某一步失败，按下面对应章节处理，不必先学习小程序发布或云开发。

## 先了解项目如何运行

把你熟悉的 Web 开发流程与本项目对应起来：

| 本地 Web 开发 | 本项目 |
|---|---|
| React 源码 | `apps/miniapp/src` 下的 React、TypeScript 和 CSS |
| Vite 等构建工具 | Taro，将源码编译为微信小程序文件 |
| 浏览器打开前端页面 | 微信开发者工具的模拟器运行小程序 |
| 浏览器 DevTools | 微信开发者工具里的 Console、Network、Storage 等调试面板 |
| 后端接口服务 | NestJS，默认端口 3000，接口前缀 `/api` |
| 数据库 | 本机 MySQL，连接配置在 `apps/server/.env` |

```text
apps/miniapp/src
       │ Taro 编译并监听文件变化
       ▼
apps/miniapp/dist
       │ 微信开发者工具读取
       ▼
小程序模拟器 ── HTTP ──► 127.0.0.1:3000/api ──► MySQL
```

Taro 本身支持多个平台，但本仓库当前的脚本明确使用 `--type weapp`，生成微信小程序。框架介绍见 [Taro 官方仓库](https://github.com/NervJS/taro)。

你贴出的 `lsof -i:3000` 输出中，`node ... (LISTEN)` 表示后端正在监听；`hbci` 是系统给 3000 端口显示的服务别名。Chrome 的 `ESTABLISHED` 连接表示浏览器连接到了后端，不表示已经打开了小程序界面。

查看端口时加 `-P` 可以直接显示数字：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

## 第一步 确认本机服务和编译产物

本手册编写时，后端已启动，数据库连接正常，小程序开发构建已运行。你可以先跳到第二步安装工具；如果关闭过终端、重启过电脑，按本节重新启动。

### 确认后端已经启动

在终端执行：

```bash
curl -i http://127.0.0.1:3000/api/score/current
```

此时没有登录凭证，预期得到 `401 Unauthorized` 和类似内容：

```json
{"code":"UNAUTHORIZED","message":"请先登录"}
```

**这里的 401 是正常结果，说明服务能响应并正在执行登录校验。** `Connection refused` 才说明端口没有服务。浏览器访问后端根路径得到 404，也不能据此判断服务没有启动，因为这里没有配置网页首页。

### 没有启动时运行后端

打开一个终端窗口，执行：

```bash
cd /Users/panwei/Downloads/go/dsh/dsh-should-quit
NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 --filter @should-quit/server start
```

看到 `Nest application successfully started` 后，保持这个终端运行。

本机已经缓存了 pnpm 12.16.1，所以这里使用 `npx --offline` 启动指定版本，避开此前出现的在线元数据证书问题。换一台没有缓存的电脑时，先去掉 `--offline` 获取 pnpm。不要直接使用本机全局的 pnpm 9.15.9。

当前配置的含义：

| 配置 | 本地使用方式 |
|---|---|
| `AUTH_MODE=mock` | 后端用模拟微信身份签发自己的登录 token |
| `AGENT_ENGINE=fake` | 顾问返回本地演示回答，不调用付费模型 |
| `DATABASE_URL` | 连接本地业务数据库 |
| `PORT=3000` | 给小程序使用的 API 端口 |
| `INTERNAL_PORT=3100` | 智能体工具内部端口，界面调试不需要访问它 |

这些配置在 `apps/server/.env` 中。当前已经配置好，不需要为了查看界面修改 JWT、数据库密码或智能体密钥。

### 启动小程序开发构建

再打开一个终端窗口，执行：

```bash
cd /Users/panwei/Downloads/go/dsh/dsh-should-quit
NODE_ENV=development API_BASE_URL=http://127.0.0.1:3000/api MOCK_LOGIN_CODE=local-dev NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 --filter @should-quit/miniapp dev
```

看到以下输出后，保持终端运行：

```text
Compiled successfully
Watching...
```

这条命令完成三件事：

- 使用开发模式编译，持续监听前端源码变化。
- 将小程序请求地址设为本机 `http://127.0.0.1:3000/api`。
- 将 mock 登录使用的业务 code 固定为 `local-dev`，方便反复编译后继续使用同一个本地用户。

`MOCK_LOGIN_CODE` 是本地演示身份标记，不是 AppID，也不是微信提供的登录凭证。

确认生成了入口文件：

```bash
ls apps/miniapp/dist/app.json
```

能看到这个路径即可。开发构建不会输出一个让你在 Chrome 打开的前端网址。

## 第二步 安装微信开发者工具

1. 打开 [微信开发者工具官方下载页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 选择 macOS 稳定版。根据「苹果菜单 → 关于本机」中显示的芯片，选择对应安装包。
3. 按安装包提示完成安装，将应用放到「应用程序」。
4. 打开微信开发者工具。
5. 使用手机微信扫描工具上的二维码，并在手机上确认登录。
6. 进入项目选择界面后，选择「小程序」类型。

这里扫码是登录开发者工具；稍后小程序内部的自动登录是另一件事。

工具的界面文字会随版本变化。后文所说的「导入」「详情」「本地设置」如果位置不同，可在项目管理页、顶部工具栏或项目设置中寻找同名或近似入口。

## 第三步 准备可用的小程序 AppID

### 当前仓库的 AppID 是占位配置

`apps/miniapp/project.config.json` 当前包含：

```json
{
  "appid": "touristappid"
}
```

`touristappid` 是游客模式标识，不是你申请到的、通常以 `wx` 开头的小程序 AppID。游客模式的可用能力有限，不要把成功导入项目当作登录能力已经可用。

**本项目即使使用 mock 登录，前端仍会先执行 `Taro.login()`，也就是微信的 `wx.login()`。** 之后才将固定的 `local-dev` code 发给 mock 后端。因此 `MOCK_LOGIN_CODE=local-dev` 并没有绕过微信侧的登录调用。游客模式若不支持这个调用，就可能停在登录页。

### 有自己的小程序 AppID

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)，进入你的小程序管理后台。
2. 在「开发管理 → 开发设置」等开发配置入口找到小程序 AppID。
3. 确认登录开发者工具的微信账号，对这个小程序具有相应开发权限。
4. 复制 AppID，在导入项目时填写。

这里需要的是小程序 AppID，不是 AppSecret，不是公众号 AppID，也不是开放平台移动应用的 AppID。

### 没有自己的 AppID

先查看开发者工具的「测试号」入口，或 [微信小程序测试号说明](https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox.html)，申请并取得你自己的测试账号信息。

如果取得了可用的、以 `wx` 开头的测试 AppID，可以用它导入，并通过后文的 Console 检查 `wx.login` 是否成功。如果当前工具只提供游客模式，或者测试账号的能力不能满足登录调用，就到微信公众平台注册自己的小程序账号，取得 AppID 后再继续完整登录流程。

不要随意从网上复制别人项目里的 AppID，也不要把公众号测试账号当作小程序测试账号使用。

**为了本地 mock 后端，不需要现在就把 `AUTH_MODE` 改为 `wechat`。** 导入界面的 AppID 解决的是微信工具和平台身份；`AUTH_MODE=mock` 决定的是本项目后端如何识别业务用户。

## 第四步 导入正确的项目目录

在微信开发者工具项目管理页点击「导入」或「导入项目」，填写：

| 表单项 | 本项目填写方式 |
|---|---|
| 项目名称 | `该溜吗` 或 `should-quit` |
| 项目目录 | `/Users/panwei/Downloads/go/dsh/dsh-should-quit/apps/miniapp` |
| AppID | 上一步准备的、你有权限使用的小程序 AppID |
| 开发模式 | 小程序 |
| 后端服务 | 如果出现选项，选择不使用云服务 |

**项目目录选择 `apps/miniapp`，不要选择仓库根目录，也不要选择 `src`。**

这个目录里有 `project.config.json`，其中：

```json
{
  "miniprogramRoot": "dist/",
  "compileType": "miniprogram"
}
```

意思是：工具读取 `apps/miniapp` 的项目配置，再到它的 `dist` 目录找小程序运行文件。按照这个配置导入，最容易保持目录、AppID 和工具设置一致。

导入已有目录即可，不需要新建项目模板，不要让工具向源码目录生成一套新的示例文件。这个项目使用本机 NestJS 后端，也不需要为了运行界面开通云开发。

导入时修改 AppID，工具可能会更新本地项目配置。这不等于把后端切成了真实微信登录，也不等于已经发布小程序。

## 第五步 允许模拟器连接本地后端

本项目开发地址是 HTTP 和本机回环地址，不能直接套用正式小程序的域名配置。

在开发者工具中：

1. 打开右上角「详情」。
2. 找到「本地设置」或项目本地调试设置。
3. 勾选类似下列名称的选项：

   > 不校验合法域名、web-view 业务域名、TLS 版本以及 HTTPS 证书

4. 如果界面将这些校验拆成多个选项，针对本机 HTTP 调试启用相应的跳过校验选项。
5. 如果有「调试基础库」选择，选择可用的稳定版本，不能低于本项目要求的 `2.20.2`。
6. 点击顶部「编译」。

这个设置用于本地调试。正式发布时要配置实际 HTTPS 域名，不能依赖开发者工具里的跳过校验开关。相关约束见 [微信网络能力文档](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

本项目的请求来自小程序网络 API。遇到 `url not in domain list` 时，先检查上述设置，不要先按普通浏览器的跨域问题去修改后端 CORS。

## 第六步 编译并看到首个界面

1. 确认前端终端显示 `Watching...`，没有红色构建错误。
2. 在开发者工具顶部选择「普通编译」。
3. 点击「编译」。
4. 如果模拟器区域没有显示，打开工具栏里的「模拟器」。
5. 等待启动页完成自动登录。

当前默认启动路径是：

```text
pages/launch/index
```

不要一开始就把启动页面改成聊天页。启动页会完成登录和基准检查，这是本项目的正常入口。

预期流程：

```text
自动登录
   ├─ 第一次使用、没有基准 → 工作基准问卷
   └─ 已经保存过基准       → 首页
```

第一次打开时出现 8 项工作基准问卷是正常行为，不代表首页打不开。依次选完并保存后，才会进入主界面。

如果你之前用同一个 `local-dev` 用户保存过基准，重新编译后直接进入首页也是正常行为。

## 第七步 走一遍界面

### 工作基准问卷

- 每屏一项，顶部显示类似 `1 / 8` 的进度。
- 选择一个选项后继续填写下一项；可以返回上一项修改。
- 8 项都选择后，点击「保存」。
- 问卷下方显示客观分预览；未填完时，提示未填项暂按「一般」预览。

### 首页

- 上方是心情打卡区，选择星级，可填写一句话备注。
- 点击「打卡」，检查今日次数与分数卡是否更新。
- 下方是分数、档位和建议；点击「查看详细建议」展开文字。

### 趋势

- 切换 7 天、30 天、90 天查看综合分趋势。
- 下方是心情日历，点击有需要查看的日期，打开打卡明细。
- 新账号只有少量数据，折线很短或出现空态都可能正常。历史月份受现有近 90 天接口范围限制。

### 顾问

- 点击「新建会话」。
- 点击预设问题，或手动输入问题后发送。
- 当前后端使用 `fake` 引擎，预期收到演示回答。它不代表已经接通 DeepSeek。

### 我的

- 点击「编辑基准」查看 8 项总览，进入单项修改并保存。
- 查看免责声明和关于信息。

## 第八步 用熟悉的调试方法排查问题

打开开发者工具里的「调试器」。你最常用到下面三个面板。

### Console 查看登录或运行错误

如果一直停在「正在登录」，或显示「登录失败，点击重试」，先看 Console 第一条相关错误。

例如 `login:fail`、AppID 无效、账号无权限，优先处理 AppID 和工具账号。此时请求甚至可能还没到本项目后端，重启 3000 端口不会解决微信侧的登录失败。

需要单独定位 `wx.login` 时，可以在小程序调试器 Console 中执行下面代码。它只输出成功与否，不打印登录 code：

```javascript
wx.login({
  success() { console.log('wx.login 调用成功') },
  fail(error) { console.error('wx.login 调用失败', error.errMsg) }
})
```

该命令需要在小程序运行上下文中执行；浏览器普通网页 Console 里没有这个 `wx` 对象。它只是单独检查平台调用，不会替你完成本项目的后端登录。

### Network 查看本地接口

正常启动时，能看到类似请求：

```text
POST http://127.0.0.1:3000/api/auth/login
GET  http://127.0.0.1:3000/api/baseline
```

进入首页后，还会请求当前评分和当天打卡记录。

| 看到的情况 | 先检查什么 |
|---|---|
| 没有 `/auth/login`，Console 报 `wx.login` 错误 | AppID、测试账号能力、开发者权限 |
| `request:fail url not in domain list` | 是否勾选本地跳过域名校验 |
| `ERR_CONNECTION_REFUSED`、连接失败 | 后端是否运行，端口是否为 3000 |
| 请求发往 `https://api.example.com/api` | 当前产物来自生产构建，需重新运行本地 `dev` 命令 |
| `401` | 登录状态是否过期；项目会自动重登并最多重试一次 |
| `409 BASELINE_REQUIRED` | 先完成基准录入，项目会引导回问卷 |
| `409 AGENT_BUSY` | 上一轮顾问回答仍在后台收尾，等待或新建会话 |
| `500` | 看后端终端和数据库状态；不是简单的前端域名问题 |

不要把登录响应里的 token、数据库密码或密钥复制到公开问题描述中。定位时提供接口路径、状态码和错误码即可。

### Storage 查看本地状态

本项目把登录 token 保存在小程序本地 Storage 的 `token` 键中。它不同于 Chrome 中你访问其他网站的 Local Storage。

如果切换过 AppID、登录账号或开发后端，导致状态看起来不一致：

1. 使用工具中的清缓存功能，或在 Storage 中删除本项目的 `token`。
2. 重新编译，从启动页进入。
3. 确认开发构建仍使用同一个 `MOCK_LOGIN_CODE=local-dev`。

清理小程序缓存不会删除 MySQL 里的基准、打卡或会话记录。因此清缓存后仍进入首页，不代表清理失败。

## 第九步 修改代码后的日常操作

| 修改内容 | 需要做什么 |
|---|---|
| `apps/miniapp/src` 的页面、样式和前端逻辑 | 保持 `dev` 运行，等待 Taro 编译成功，再观察模拟器；必要时点「编译」 |
| `API_BASE_URL`、`MOCK_LOGIN_CODE` 等启动环境变量 | 停止前端 `dev`，使用新的环境变量重新启动，再点「编译」 |
| `apps/server/src` 后端源码 | 重新构建 server，并重启后端；当前 `start` 不是热更新命令 |
| `apps/server/.env` | 重启后端后生效 |
| `packages/shared/src` 共用代码 | 重新构建 shared，并按使用位置重启前端或后端 |

修改后端时，在仓库根目录执行：

```bash
NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 --filter @should-quit/server build
```

然后回到后端终端按 `Ctrl+C`，再运行第一节的后端启动命令。

修改 shared 时，先构建它：

```bash
NODE_USE_SYSTEM_CA=1 npx --offline -y pnpm@12.16.1 --filter @should-quit/shared build
```

前端构建输出在 `apps/miniapp/dist`。**日常编辑 `src`，不要直接修改 `dist`，否则下次编译会覆盖修改。** Taro 已负责依赖打包，这套项目的正常流程不要求每次再点击开发者工具的「构建 npm」。

## 第十步 常见问题速查

### 导入后提示找不到 app.json

先确认导入目录是：

```text
/Users/panwei/Downloads/go/dsh/dsh-should-quit/apps/miniapp
```

再确认存在：

```text
apps/miniapp/project.config.json
apps/miniapp/dist/app.json
```

如果 `dist/app.json` 不存在，运行第一节的小程序 `dev` 命令。不要手动创建空的 `app.json` 来绕过问题。

### 为什么后端端口有监听，但模拟器仍然白屏

端口监听只说明后端在运行。还需要同时满足：Taro 构建成功、导入目录正确、AppID 可用、小程序初始化没有运行错误。先看 Console，再看 Network。

### 编译后仍然连接 example.com

`build` 可能生成生产配置，而没有设置 `API_BASE_URL` 时生产默认地址是 `https://api.example.com/api`。这个地址是占位值。

停止前端进程，重新执行第一节完整的 `NODE_ENV=development ... dev` 命令。环境变量会写入编译产物，单纯重启后端不会改变已经编译好的地址。

### 提示端口 3000 或 3100 已被占用

先检查监听者：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3100 -sTCP:LISTEN
```

如果是已经启动的本项目，直接复用，不要再启动第二份。3000 与 3100 由同一个后端进程管理。优先回到启动该进程的终端按 `Ctrl+C` 停止；不要因为看到 Chrome 连接就关闭或终止所有 Node 进程。

### 工具打开后只显示一页问卷

这是首次基准录入流程。必须 8 项都选完并保存，才进入带四个底部 tab 的主界面。后续在「我的 → 编辑基准」进入编辑总览。

### 顾问只返回固定内容

当前 `AGENT_ENGINE=fake` 是本地演示模式。查看界面无需配置模型 Key。真实智能体需要另行配置 Key、选择真实引擎并做联调，不要为了打开首页就先修改这些配置。

### 修改源码后没有变化

按顺序检查：

1. 修改的是 `apps/miniapp/src`，不是另一个目录或 `dist`。
2. 前端终端还在运行，并显示新的编译成功记录。
3. 开发者工具打开的是本仓库的 `apps/miniapp`。
4. 点击工具中的「编译」；必要时清理工具编译缓存后再编译。
5. 如果改的是环境变量，先重启前端构建进程。

## 第十一步 手机预览的区别

先完成电脑模拟器流程，再使用工具顶部的「预览」或「真机调试」。当前 `127.0.0.1:3000` 配置是给本机模拟器使用的，不能直接当作手机可访问的地址。

在手机上，`127.0.0.1` 指的是手机自己，不是你的 Mac。仅扫描预览二维码，不会自动把 Mac 的后端暴露给手机。

真机联调还需要：

- 使用支持预览或真机调试、且你有权限的小程序 AppID。
- 让手机能够访问后端，例如同一局域网中的 Mac 地址，或可访问的 HTTPS 测试服务。
- 更改前端 `API_BASE_URL` 后重新编译。
- 按当前工具和微信平台的要求处理调试网络设置；不能假设模拟器的跳过校验开关对所有手机运行方式都生效。

正式环境应使用配置好的 HTTPS 合法域名。首次打开界面时，先使用电脑模拟器即可，不需要同时完成真机和发布配置。

## 第十二步 结束和下次启动

开发结束时：

1. 在前端终端按 `Ctrl+C`，停止 Taro 监听。
2. 在后端终端按 `Ctrl+C`，停止 NestJS 服务。
3. 关闭开发者工具窗口。

如果服务是由助手后台启动、你没有对应终端，可以让助手停止服务；不要重复启动后再用 `killall node` 清理。

下次开发时按下面顺序操作：

```text
确认 MySQL 可用
    ↓
启动后端 3000
    ↓
启动 Taro dev 并等待 Watching
    ↓
微信开发者工具打开 apps/miniapp
    ↓
检查 AppID 和本地网络设置
    ↓
点击编译，从启动页进入
```

## 当前项目的验收标准

满足以下几项，就说明你已经成功打开并连接了本地小程序：

- 模拟器能显示基准问卷，或显示首页。
- 完成 8 项基准后能进入首页。
- 选择星级并打卡成功，今日次数和评分能够更新。
- 底部能切换首页、趋势、顾问、我的。
- 顾问页能创建会话并收到 fake 演示回答。
- Network 中请求发往本机 `http://127.0.0.1:3000/api`。

更完整的逐项检查见 [小程序验收记录](miniapp-smoke.md)，智能体服务配置见 [部署说明](agent-deployment.md)。

## 官方参考入口

- [微信开发者工具下载](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- [微信小程序项目配置](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)
- [微信小程序测试号说明](https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox.html)
- [微信网络能力说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [微信 wx.login 接口](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html)
- [微信官方小程序示例](https://github.com/wechat-miniprogram/miniprogram-demo)
- [Taro 官方仓库](https://github.com/NervJS/taro)

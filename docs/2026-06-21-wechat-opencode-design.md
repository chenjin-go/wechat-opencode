# wechat-opencode 设计文档

> 一个通过微信与 OpenCode 交互的 CLI 桥接工具。
> 状态: **设计阶段**。P0 范围：核心桥接 + 基础命令。

## 概述

`wechat-opencode` 是一个独立的 CLI 工具，通过微信 iLink Bot API 将微信消息桥接到 OpenCode。用户可通过手机微信发送消息给 OpenCode，并接收 AI 回复。

**定位**: 个人开发者工具，把微信变为 OpenCode 的移动控制通道。

## 架构

```
WeChat App
    │
    │ iLink Bot API (长轮询 + 发送)
    ▼
wechat-opencode (独立 Bun 进程)
    │
    │ Raw HTTP fetch (REST API)
    ▼
OpenCode Server (本地或远程, 无认证模式)
```

### 核心数据流

```
CLI start
  → load config (wechat-opencode.json)
  → 检查 login state
    → 无 → 扫码登录 (iLink API)
  → 标记 project 绑定状态
  → 启动 pollLoop

状态机:
  NO_LOGIN      → 扫码 → LOGGED_IN
  LOGGED_IN     → (无 project) → NO_PROJECT
                → (有 project + 无 session) → SESSION_SELECT
                → (有 project + 有 session) → READY (复用)
  NO_PROJECT    → 用户选项目 → SESSION_SELECT
  SESSION_SELECT → 用户选/建 session → READY
  READY         → /projects 换项目 → 保留旧 session → SESSION_SELECT

pollLoop (35s 长轮询):
  → getUpdates → parseMessage
    → 当前状态 = NO_PROJECT?
      → 是 → 路由到 project 选择流程 → sender.reply
      → 否 → 命令? → handleCommand → sender.reply
           → 消息? → queue.enqueue
                      → (dequeue 当 AI 空闲)
                      → POST /api/session/:id/prompt
                      → POST /api/session/:id/wait (阻塞)
                      → GET /api/session/:id/messages
                      → sender.sendAdaptive

queue (FIFO):
  → 串行处理，一次一条消息
  → 防止并发 prompt 导致的上下文混乱
  → /abort 可清空队列
```

## P0 模块

```
wechat-opencode/
├── src/
│   ├── index.ts       # CLI 入口
│   ├── config.ts      # 配置加载
│   ├── login.ts       # 微信 iLink 扫码登录
│   ├── bridge.ts      # 主流程编排
│   ├── poller.ts      # 35s 长轮询拉消息
│   ├── parser.ts      # 消息解析 + 命令识别
│   ├── commands.ts    # 命令处理
│   ├── sender.ts      # 消息回传 (分块)
│   ├── session.ts     # OpenCode 会话管理
│   ├── state.ts       # 文件持久化
│   └── types.ts       # 类型定义
├── docs/
├── package.json
├── tsconfig.json
└── wechat-opencode.example.json
```

### 模块详情

#### config.ts

从 `wechat-opencode.json` 加载配置。JSON 支持注释。

```json
{
  "opencode": {
    "base_url": "http://127.0.0.1:4096"
  },
  "wechat": {
    "state_dir": ".runtime",
    "poll_interval_ms": 3000,
    "max_reply_chars": 6000
  },
  "projects": [
    { "id": "myapp", "name": "My App", "dir": "/path/to/myapp" }
  ]
}
```

`projects` 是**可选的覆盖/补充**列表。主数据源是 OpenCode server 的 `GET /project` API，返回所有已知项目（`id`, `name?`, `worktree`, `vcs?`）。

`projects` 仅在用户需要以下情况时手动添加：
- 使用未被 OpenCode 记录过的目录
- 覆盖 `name` 显示名
- 限制可选项（只暴露部分项目）

#### login.ts

- 调用 `GET /ilink/bot/get_bot_qrcode?bot_type=3` 获取二维码，打印到终端
- 轮询 `GET /ilink/bot/get_qrcode_status`（最长 8 分钟）
- 所有 iLink API 请求需携带 `X-WECHAT-UIN` header（base64 编码的随机 uint32，每次请求生成）
- 确认后获取 `bot_token` + `ilink_bot_id` + `baseurl`，保存到 `account.json`
- 支持 `OPENCODE_WECHAT_ALLOW_PLACEHOLDER_LOGIN=true` 本地开发模式

#### bridge.ts

编排完整启动流程：
1. 检查登录 → 未登录则扫码
2. 加载 project 绑定状态（若无则标记 `NO_PROJECT`）
3. 创建/复用 session（仅在 READY 状态下）
4. 启动 pollLoop（无论 project 状态，始终启动）

消息分发逻辑（状态机路由）：
- `NO_PROJECT` → 任何消息路由到 project 选择流程 → commands 处理项目列表交互
- `SESSION_SELECT` → 任何消息路由到 session 选择流程 → commands 处理会话列表交互
- `READY` + 命令 → commands 处理
- `READY` + 普通消息 → queue.enqueue

队列消费（串行）：
- dequeue → POST /api/session/:id/prompt
  → POST /api/session/:id/wait (阻塞直到 AI 空闲)
  → GET /api/session/:id/message?order=desc&limit=10
  → 从返回的 messages 中查找最后一个 type=assistant 的消息
  → 提取其 content[] 中 type=text 的 text 字段，拼接为回复文本
  → sender.sendAdaptive(回复文本, context_token)

消息文本提取规则：
```
GET /api/session/:id/message?order=desc&limit=10

响应 messages[] 中逆向遍历，找到第一个 type="assistant" 的消息:
{
  type: "assistant",
  content: [
    { type: "reasoning", text: "..." },    // 跳过，模型思考过程
    { type: "text", text: "最终回复" },      // 提取
    { type: "tool", id: "...", ... }        // 跳过，工具调用
  ]
}

取所有 content[].type="text" 的 .text 拼接为回复字符串。
若无 assistant 消息 → 回复 "AI 未产生文本回复"。
```

自动恢复：
- iLink token 过期 (ret=-2/-14) → 自动重新扫码登录 → 恢复 pollLoop

#### poller.ts

- 35s 长轮询 `POST /ilink/bot/getupdates`，带 `get_updates_buf` 游标增量拉取
- 每次 poll 成功后持久化 `get_updates_buf` 到 `runtime.json`，重启后恢复
- 每个请求携带 `X-WECHAT-UIN` header（随机生成）
- 失败重试：3 次降级为 30s 间隔
- 检测 `ret=-2` (Token 无效) / `ret=-14` (会话过期) → 触发 bridge 自动重新登录
- 使用 AbortController 超时控制

#### parser.ts

- 解析 `WechatRawMessage`，提取文本内容
- P0 仅支持纯文本消息 (`item.type=1`)
- 其他类型（图片 type=2、语音 type=3、文件 type=4、视频 type=5）统一回复"请发送文字消息"
- 识别命令: `/status`, `/new`, `/help`, `/projects`, `/sessions`

#### commands.ts

| 命令 | 实现 |
|------|------|
| `/help` | 静态帮助文本 |
| `/status` | 当前 session 信息 + 项目 + 运行状态 + 队列长度 |
| `/new` | `POST /api/session { directory }` → 新 session → 绑定为当前（保留旧 session 不删） |
| `/projects` | 列出配置项目 + 当前选中 → 选择后进入 SESSION_SELECT |
| `/sessions` | 列出当前项目最近 5 条 session + 当前选中 → 选择后绑定为新当前 |

#### 项目选择流程 (NO_PROJECT 状态)

数据来源优先级：
1. 若 `wechat-opencode.json` 有 `projects` 数组 → 使用该列表（用户手动限定范围）
2. 否则 → 调用 `GET /project` 获取所有已知项目，按 `time.updated` 降序取最近 10 条
3. 若超出 10 条则末尾提示"还有 N 个项目，回复 search <关键词> 查找"
3. 若两者皆空 → 回复"暂无可用项目，请先通过 OpenCode 打开一个项目目录"

```
bridge 收到用户消息
  → 当前状态 = NO_PROJECT
  → 获取项目列表 (config → 或 GET /project)
  → 构建列表文本:
    "请选择项目:\n1. myapp (My App)\n2. other (Other)\n\n回复序号或项目ID"
  → sender.sendMessage(列表文本, context_token)
  → 等待用户回复
  → 用户回复 "1" 或 "myapp"
    → 匹配 id 或序号
    → 保存 project.json { project_id, dir: worktree, name }
    → 状态切换为 SESSION_SELECT

只有一个项目时跳过列表，直接自动选中。
```

#### 会话选择流程 (SESSION_SELECT 状态)

数据来源：`GET /api/session?directory=<project.worktree>&limit=5&order=desc`

响应：
```json
{
  "data": [
    {
      "id": "ses_abc123",
      "title": "修复登录bug",
      "time": { "updated": "2026-06-21T10:00:00Z" }
    },
    {
      "id": "ses_def456",
      "title": "添加用户管理",
      "time": { "updated": "2026-06-20T15:30:00Z" }
    }
  ],
  "cursor": { "previous": "...", "next": "..." }
}
```

```
状态进入 SESSION_SELECT
  → 调 GET /api/session?directory=<project.worktree>&limit=5&order=desc
  → 构建列表文本:
    "项目 myapp 的会话:\n1. 修复bug (06-21)\n2. 添加功能 (06-20)\n...\n回复序号，或发 new 创建新会话"
  → sender.sendMessage(列表文本, context_token)
  → 用户回复 "1" → 绑定 sessions[0].id → 状态 → READY
  → 用户回复 "new"
    → POST /api/session { directory: project.worktree }
    → 绑定新 session_id → 状态 → READY

空列表时直接发 "该项目暂无会话，回复 new 创建新会话"。
```

#### session.ts

- 使用 Raw HTTP fetch 直接调 OpenCode REST API（无 SDK 依赖）
- `GET /project` — 获取所有已知项目列表（项目选择流程的数据源）
- `POST /api/session` — 创建 session，传 `{ directory: project.worktree }`
- `GET /api/session?directory=<path>&limit=5&order=desc` — 按目录过滤列出 sessions
- `GET /api/session/:id` — 检查 session 是否存活（重启时复用验证）
- `POST /api/session/:id/prompt` — 发送 prompt，`{ prompt, delivery: "immediate" }`
- `POST /api/session/:id/wait` — 阻塞等待 AI 空闲（同步等待完整回复）
- `GET /api/session/:id/message?order=desc&limit=10` — 获取最新消息（含 AI 回复文本）
- `POST /session/:id/abort` — 中止当前 AI 任务
- 每个项目一个活跃 session，切换项目时保留旧 session 不解绑
- 无自动超时重建，session 持久存在直到手动 /new 或切换选择

#### sender.ts

- 调用 `POST /ilink/bot/sendmessage`
- 每个请求携带 `X-WECHAT-UIN` header + `Authorization` header (Bearer token)
- 使用 `context_token`（从入站消息获取）保持对话上下文
- 生成唯一 `client_id`（UUID）用于消息发送
- `sendAdaptive`: 短回复直接发送；长回复发送摘要 + "完整内容已输出到控制台，请查看"
- 超出 `max_reply_chars` 时按序号分块 `[1/3]`

#### state.ts

文件持久化，JSON 格式：

```
.runtime/
├── account.json   # { account_id, token, base_url, saved_at }
├── project.json   # { project_id, dir, name }
└── runtime.json   # { status, session_id, last_poll_at, poll_buf }
```

`poll_buf` 字段持久化 `get_updates_buf` 游标，用于重启后断点续传。

提供 `getAccount`, `setAccount`, `getProject`, `setProject`, `getRuntime`, `setRuntime` 接口。

## CLI 接口

```
wechat-opencode start           # 启动桥接 (登录 + 轮询 + 按需选项目)
wechat-opencode login           # 仅扫码登录
wechat-opencode logout          # 清除登录态
wechat-opencode status          # 查看运行状态
wechat-opencode project <id>    # 切换项目
wechat-opencode help            # 帮助
```

## 边缘情况处理 (Edge Cases)

### /abort (中止)

在 P0 中提升，因其是单一用户串行模式下的关键控制手段。

设计：
```
接收 /abort:
  → 若 processing = true (有正在处理的 prompt)
    → 设置 abort_requested = true
    → 回复 "正在等待当前任务完成，完成后将中止"
  → 若 processing = false
    → 回复 "没有正在处理的任务"

每条消息处理前检查:
  if abort_requested:
    abort_requested = false
    → 跳过剩余消息，回复 "已中止"

processPrompt 完成后检查:
  if abort_requested:
    abort_requested = false
    → 跳过后续消息，回复 "当前任务已完成，后续消息已中止"
    → continue (下次 poll 正常处理新消息)

OpenCode API 支持: POST /api/session/:id/abort
  → 可并行调用，中断当前 AI 生成
  → 调用后 session.wait() 会立即返回
```

实现要点：
- `abort_requested` 为共享状态变量（同一事件循环，无需锁）
- `/abort` 本身是 command 路由，非 enqueue
- 跨消息 batch 也生效（设置 flag 后后续 batch 依然检查）

### 消息积压 / 队列阻塞

```
场景: 用户快速发送 5+ 条消息后等待

行为:
  → 同批消息串行处理，每条 processPrompt 耗时 5-30s
  → 若中途收到 /abort → 跳过剩余消息
  → 若中途收到 /help 等命令 → 立即回复（非 enqueue）

保护:
  → 单次 poll 最多处理 20 条
  → 超出部分在下次 poll 处理（get_updates_buf 增量机制）

用户感知:
  → 发送后无即时反馈（等待前一消息完成）
  → 可选改进: 先回复 "正在处理，请稍候..." 再处理
```

### 并发用户 (P0 限制)

```
P0 假设单微信用户:
  → 状态机 (NO_PROJECT/SESSION_SELECT/READY) 无用户隔离
  → 多用户消息交叉会破坏状态
  → iLink Bot API 本身为单 bot 设计

P1 计划: 按 from_user_id 隔离状态
  → 每个用户独立 StateStore
  → 消息队列按用户分片
```

### Token 轮转 (re-login 更新)

场景：iLink token 过期后自动重新扫码，各模块需同步更新 token。

当前设计：bridge 检测到 `SESSION_EXPIRED` / `TOKEN_INVALID` 后重新扫码，但 sender 和 poller 的 token 是**创建时闭包**，不会自动更新。

修复（P0 实现）：
```typescript
// 为 createSender / createPoller 增加 setToken 方法
// bridge 重登录后调用:
sender.setToken(newToken)
poller.setToken(newToken)
```

这样 sender/poller 内部使用可变引用，setToken 后后续请求自动使用新 token。

### 非文本消息处理

```
消息类型          处理
type=1 (文本)     正常解析 + 路由
type=2 (图片)     回复 "请发送文字消息"
type=3 (语音)     回复 "请发送文字消息"
type=4 (文件)     回复 "请发送文字消息"
type=5 (视频)     回复 "请发送文字消息"
其他              忽略不处理
```

### 重启恢复

```
崩溃/重启后:
  → 读取 account.json → 验证 token → 若有效则跳过登录
  → 读取 project.json → 恢复项目绑定状态
  → 读取 runtime.json → 恢复 poll_buf (断点续传) + session_id
  → 状态从 READY 恢复（无需重新选择）
```

### 网络错误处理

```
iLink API 错误:
  5xx / 连接失败 → 重试 3 次，间隔 5s/10s/20s
  全部失败 → 持久错误，等待下次 poll 周期（35s 后）

OpenCode API 错误:
  prompt/wait 失败 → 回复 "AI 处理异常，请重试"
  session 不存在 → 自动重建 session

超时:
  poller: 40s 超时 (AbortController)
  wait: 120s 超时 (OpenCode 服务端限制)
```

## P1 (后续)

这些命令在 P0 之后实现：

- `/detach` — 不结束会话退出
- `/messages` — 浏览消息/恢复/分叉
- `/worktree` — 切换 git 工作树
- `/open` — 浏览目录添加项目
- `/ls` — 列出目录
- `/rename` — 重命名会话
- `/commands` — 运行自定义命令
- `/skills` — 运行技能
- `/mcps` — 切换 MCP
- `/tts` — 音频回复模式
- `/task` / `/tasklist` — 任务调度
- `/opencode_start` / `/opencode_stop` — 管理 OpenCode 服务

## 非目标 (P0)

- 多用户支持 (仅单微信用户)
- 企业级多租户
- 通用聊天机器人框架
- 高可用部署
- 可视化 Web 控制台

## 技术选型

| 层面 | 选择 | 原因 |
|------|------|------|
| 运行时 | Bun | TypeScript 原生，快速迭代，自带 fetch |
| 语言 | TypeScript | 类型安全 |
| API 方式 | Raw HTTP fetch | 直接调 OpenCode REST API，避免 SDK 依赖 |
| 认证 | 无认证模式 | `opencode serve` 不设密码，局域网使用 |
| 持久化 | 本地 JSON 文件 | 简单可靠，无需数据库 |
| 微信协议 | iLink Bot API | 已验证的协议，文档完善 |

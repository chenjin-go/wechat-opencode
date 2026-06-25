# wechat-opencode

通过微信与 [OpenCode](https://opencode.ai) 交互的 CLI 桥接工具。在微信里给机器人发消息，OpenCode 处理并回复。

## 安装

### 方式一：npm（推荐）

```bash
npm install -g @moodcc/wechat-opencode
```

安装后全局可用 `wechat-opencode` 命令。

### 方式二：GitHub Release 下载

1. 打开 [Releases 页面](https://github.com/chenjin-go/wechat-opencode/releases)
2. 下载最新版 `.exe` 文件
3. 放到 `C:\Windows\System32\` 或任意 `%PATH%` 目录，或直接双击运行

### 方式三：源码运行

```bash
git clone https://github.com/chenjin-go/wechat-opencode.git
cd wechat-opencode
bun install
bun run src/index.ts start
```

## 快速开始

```bash
# 1. 创建工作目录
mkdir wxo-work && cd wxo-work

# 2. 扫码登录（仅首次）
wechat-opencode login

# 3. 启动桥接
wechat-opencode start
```

> OpenCode 默认地址 `http://127.0.0.1:4096`，可通过 `--url` 指定：
> `wechat-opencode start --url http://192.168.1.100:4096`

成功后，向你的机器人微信账号发送消息，OpenCode 会自动处理并回复。

## CLI 命令

| 命令 | 功能 |
|------|------|
| `wechat-opencode start [--url <地址>]` | 启动桥接（可选指定 OpenCode 地址） |
| `wechat-opencode login` | 扫码登录 |
| `wechat-opencode --version` | 显示版本号 |
| `wechat-opencode help` | 帮助信息 |

## 微信命令

启动后，向机器人微信账号发送：

| 命令 | 功能 |
|------|------|
| `/help` | 帮助信息 |
| `/status` | 查看当前项目、会话、模型 |
| `/projects` | 列出项目，`/projects <序号>` 选择 |
| `/sessions` | 列出会话，`/sessions <序号>` 选择，`/sessions new` 新建 |
| `/model` | 列出模型，`/model <序号>` 选择 |
| `/new` | 快捷新建会话 |
| `/abort` | 中止当前 AI 任务 |

非命令消息自动发送给 OpenCode AI 处理。

## 技术栈

- **Bun** — TypeScript 运行时 + 打包器
- **TypeScript** — 语言
- **@opencode-ai/sdk** — OpenCode API
- **@wechatbot/wechatbot** — 微信 iLink Bot API

## 许可

MIT

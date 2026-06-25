# wechat-opencode

通过微信与 [OpenCode](https://opencode.ai) 交互的 CLI 桥接工具。在微信里给机器人发消息，OpenCode 处理并回复。

## 安装

```bash
npm install -g @moodcc/wechat-opencode
```

## 快速开始

```bash
# 创建工作目录
mkdir wechat-opencode-work && cd wechat-opencode-work

# 创建配置（参考下方配置说明）
wechat-opencode --version   # 验证安装

# 扫码登录（仅首次）
wechat-opencode login

# 启动桥接（登录 + 监听消息）
wechat-opencode start
```

扫码后向你的机器人微信账号发消息即可。

## 配置

在工作目录下创建 `wechat-opencode.json`：

```json
{
  "opencode": {
    "base_url": "http://127.0.0.1:4096"
  },
  "wechat": {
    "state_dir": ".runtime",
    "poll_interval_ms": 35000,
    "max_reply_chars": 6000
  },
  "projects": [
    { "id": "myapp", "name": "My App", "dir": "/path/to/myapp" }
  ]
}
```

`projects` 可选，不填则从 OpenCode 服务自动获取。`.state_dir` 目录存放登录凭证和运行时状态，建议加入 `.gitignore`。

## CLI 命令

| 命令 | 功能 |
|------|------|
| `wechat-opencode start` | 启动桥接 |
| `wechat-opencode login` | 扫码登录 |
| `wechat-opencode help` | 帮助信息 |
| `wechat-opencode --version` | 显示版本号 |

## 微信命令

安装启动后，向机器人微信账号发送：

| 命令 | 功能 |
|------|------|
| `/help` | 帮助信息 |
| `/status` | 当前项目、会话、模型状态 |
| `/projects` | 列出并选择项目 |
| `/sessions` | 列出并选择会话（`/sessions new` 新建） |
| `/model` | 列出并选择模型 |
| `/new` | 新建会话 |
| `/abort` | 中止当前 AI 任务 |

非命令消息自动发送给 OpenCode AI 处理。

## 开发

```bash
git clone https://github.com/chenjin-go/wechat-opencode.git
cd wechat-opencode
bun install

# 本地运行
bun run src/index.ts login
bun run src/index.ts start

# 测试
bun test
```

## 构建发布

```bash
# 一键构建 4 平台 + npm publish
bun run release

# 自动升版本并发布
bun run release:patch   # 0.1.0 → 0.1.1
bun run release:minor   # 0.1.0 → 0.2.0
bun run release:major   # 0.1.0 → 1.0.0
```

## 技术栈

- **Bun** — TypeScript 运行时 + 打包器
- **TypeScript** — 语言
- **@opencode-ai/sdk** — OpenCode API
- **@wechatbot/wechatbot** — 微信 iLink Bot API

## 许可

MIT

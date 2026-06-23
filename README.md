# wechat-opencode

通过微信与 [OpenCode](https://opencode.ai) 交互的 CLI 桥接工具。在微信里给机器人发消息，OpenCode 处理并回复。

## 快速开始

```bash
# 安装依赖
bun install

# 复制配置并修改
cp wechat-opencode.example.json wechat-opencode.json

# 扫码登录（仅首次）
bun run src/index.ts login

# 启动桥接（登录 + 监听消息）
bun run src/index.ts start
```

扫码后向你的机器人微信账号发消息即可。

## 配置

`wechat-opencode.json`（已 gitignore，从 `wechat-opencode.example.json` 复制）：

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

`projects` 可选，不填则从 OpenCode 服务自动获取。

## 命令

微信中发送：

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

## 测试

```bash
bun test              # 全部测试
bun test --watch      # 监听模式
bun test tests/config.test.ts  # 单文件
```

`tests/commands.test.ts` 和 `tests/session.test.ts` 需要 OpenCode 运行在 `http://127.0.0.1:4096`。

## 技术栈

- **Bun** — TypeScript 运行时
- **TypeScript** — 语言
- **@opencode-ai/sdk** — OpenCode API
- **@wechatbot/wechatbot** — 微信 iLink Bot API

## 许可

MIT

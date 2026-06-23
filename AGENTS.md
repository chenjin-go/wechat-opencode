# wechat-opencode

微信 ↔ OpenCode CLI 桥接。Bun + TypeScript。

## Commands

| `bun run src/index.ts start` | 启动桥接 (登录 + 监听) |
| `bun run src/index.ts login` | 仅扫码登录 |
| `bun run src/index.ts help` | 帮助信息 |

| `bun test` | 全部测试 |
| `bun test tests/config.test.ts` | 单文件测试 |
| `bun test --watch` | watch 模式 |

## Architecture

```
src/
  index.ts    — CLI 入口 + bridge 编排 (start/login)
  config.ts   — 加载 wechat-opencode.json
  bridge.ts   — 消息路由 (/cmd → reply, else → enqueue)
  commands.ts — /help /status /new /projects /sessions /model /abort
  session.ts  — OpenCode API 客户端 (封装 @opencode-ai/sdk/v2)
  state.ts    — 文件持久化 (.runtime/{account,project,runtime}.json)
  types.ts    — 类型定义
tests/        — 测试 (bun:test)
```

## Important gotchas

- **Integration tests require running OpenCode**: `tests/commands.test.ts` and `tests/session.test.ts` connect to `http://127.0.0.1:4096`. They will fail without an OpenCode server.
- **Config is gitignored**: `wechat-opencode.json` in `.gitignore`. Copy from `wechat-opencode.example.json`.
- **State dir is `.runtime/`** (gitignored). Contains `account.json`, `project.json`, `runtime.json`.
- **`BUN_TEST` env guard**: `src/index.ts:151` checks `process.env.BUN_TEST` to prevent `main()` from running during tests.
- **Design doc in `docs/`** but code has diverged — some modules from design (poller.ts, parser.ts, login.ts, sender.ts) were consolidated into existing files.
- **@wechatbot/wechatbot** provides WeChat iLink Bot API client (login, QR code, polling, send/receive).

import { loadConfig } from "./config"
import { StateStore } from "./state"
import { createSessionClient } from "./session"
import { createCommandHandlers } from "./commands"
import { createRouter } from "./bridge"
import type { AppConfig } from "./types"
import { WeChatBot } from "@wechatbot/wechatbot"
import type { IncomingMessage } from "@wechatbot/wechatbot"

export async function processPrompt(
  session: ReturnType<typeof createSessionClient>,
  text: string,
  sessionId: string,
  model?: { providerID: string; modelID: string },
): Promise<string> {
  return session.promptAndWait(sessionId, text, model)
}

export async function startBridge(
  bot: WeChatBot,
  state: StateStore,
  session: ReturnType<typeof createSessionClient>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal) {
    signal.addEventListener("abort", () => bot.stop())
  }

  const creds = await bot.login({
    callbacks: {
      onQrUrl: async (url) => {
        console.log("需要扫码登录...")
        const { default: QRCode } = await import("qrcode")
        const s = await QRCode.toString(url, { type: "terminal", small: true })
        console.log(s)
        console.log(`或复制链接到浏览器打开:\n  ${url}`)
      },
      onScanned: () => console.log("二维码已扫描，请在手机上确认..."),
    },
  })
  console.log(`登录成功: ${creds.accountId}`)

  await state.setAccount({
    account_id: creds.accountId,
    token: creds.token,
    base_url: creds.baseUrl,
    user_id: creds.userId,
    saved_at: new Date().toISOString(),
  })

  const handlers = createCommandHandlers({ session, state })
  const router = createRouter(handlers)

  const proj = await state.getProject()
  const runtime = await state.getRuntime()
  if (proj) console.log(`当前项目: ${proj.name} (${proj.dir})`)
  if (runtime?.session_id) console.log(`当前会话: ${runtime.session_id}`)

  console.log("开始监听消息...")

  bot.onMessage(async (msg: IncomingMessage) => {
    const text = msg.text?.trim() || ""
    console.log(`收到消息: ${text}`)

    const r = await router.route(text, msg.userId, msg._contextToken ?? "")
    console.log(`路由结果: ${r.action}`)

    if (r.action === "enqueue") {
      const rt = await state.getRuntime()
      if (!rt?.session_id) {
        await bot.reply(msg, "请先选择项目和会话\n/projects - 查看项目列表\n/sessions - 查看/创建会话")
        return
      }
      try {
        const replyText = await processPrompt(session, text, rt.session_id, rt.model)
        await bot.reply(msg, replyText)
      } catch (e) {
        console.error("处理消息失败:", e)
        await bot.reply(msg, "AI 处理异常，请重试")
      }
    } else {
      await bot.reply(msg, r.text)
    }
  })

  await bot.start()
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (cmd === "login") {
    const bot = new WeChatBot({ storage: "file", logLevel: "info" })
    const creds = await bot.login({
      force: true,
      callbacks: {
        onQrUrl: async (url) => {
          console.log("需要扫码登录...")
          const { default: QRCode } = await import("qrcode")
          const s = await QRCode.toString(url, { type: "terminal", small: true })
          console.log(s)
          console.log(`或复制链接到浏览器打开:\n  ${url}`)
        },
        onScanned: () => console.log("二维码已扫描，请在手机上确认..."),
      },
    })
    const config = await loadConfig("wechat-opencode.json")
    const state = new StateStore(config.wechat.state_dir)
    await state.setAccount({
      account_id: creds.accountId,
      token: creds.token,
      base_url: creds.baseUrl,
      user_id: creds.userId,
      saved_at: new Date().toISOString(),
    })
    console.log(`\n登录成功: ${creds.accountId}`)
    return
  }

  if (cmd === "start") {
    const config = await loadConfig("wechat-opencode.json")
    const state = new StateStore(config.wechat.state_dir)
    const session = createSessionClient(config.opencode.base_url)

    const bot = new WeChatBot({
      storage: "file",
      logLevel: "info",
    })

    await startBridge(bot, state, session)
    return
  }

  if (cmd === "help" || !cmd) {
    console.log(`
wechat-opencode - 微信与 OpenCode 的桥接工具

用法:
  wechat-opencode start     启动桥接
  wechat-opencode login     扫码登录
  wechat-opencode help      显示帮助
`)
    return
  }

  console.error(`未知命令: ${cmd}`)
  process.exit(1)
}

if (!process.env.BUN_TEST) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

import { loadConfig } from "./config"
import { StateStore } from "./state"
import { createLoginClient } from "./login"
import { createPoller } from "./poller"
import { createSender } from "./sender"
import { createSessionClient } from "./session"
import { createCommandHandlers } from "./commands"
import { createRouter } from "./bridge"
import type { AppConfig } from "./types"

export interface BridgeContext {
  config: AppConfig
  state: StateStore
  login: ReturnType<typeof createLoginClient>
  session: ReturnType<typeof createSessionClient>
  sender: ReturnType<typeof createSender>
  poller: ReturnType<typeof createPoller>
  handlers: ReturnType<typeof createCommandHandlers>
  router: ReturnType<typeof createRouter>
}

export async function processPrompt(
  session: ReturnType<typeof createSessionClient>,
  text: string,
  sessionId: string,
): Promise<string> {
  await session.prompt(sessionId, text)
  await session.wait(sessionId)
  const messages = await session.getMessages(sessionId)
  const reply = session.extractAssistantText(messages)
  return reply ?? "AI 未产生文本回复"
}

export async function startBridge(ctx: BridgeContext, signal?: AbortSignal): Promise<void> {
  const { config, state, login, session, sender, poller, handlers, router } = ctx

  let token: string

  const acct = await state.getAccount()
  if (acct) {
    token = acct.token
  } else {
    console.log("需要扫码登录...")
    const ls = await login.waitForLogin()
    token = ls.token
    await state.setAccount({
      account_id: ls.account_id,
      token: ls.token,
      base_url: ls.base_url,
      saved_at: new Date().toISOString(),
    })
  }

  const proj = await state.getProject()
  const runtime = await state.getRuntime()

  let botStatus: string = "READY"
  if (!proj) botStatus = "NO_PROJECT"
  else if (!runtime?.session_id) botStatus = "SESSION_SELECT"

  console.log(`状态: ${botStatus}`)

  let pollBuf = runtime?.poll_buf ?? ""
  let abortRequested = false

  for (;;) {
    if (signal?.aborted) break

    const result = await poller.poll(pollBuf)
    if (result.buf) pollBuf = result.buf

    if (result.error) {
      console.error(`轮询错误: ${result.error}`)
      if (result.error === "SESSION_EXPIRED" || result.error === "TOKEN_INVALID") {
        console.log("Token 过期，重新登录...")
        const ls = await login.waitForLogin()
        token = ls.token
        sender.setToken(token)
        poller.setToken(token)
        await state.setAccount({
          account_id: ls.account_id,
          token: ls.token,
          base_url: ls.base_url,
          saved_at: new Date().toISOString(),
        })
      }
      continue
    }

    for (const msg of result.messages) {
      if (abortRequested) {
        abortRequested = false
        continue
      }

      if (msg.text === "/abort") {
        abortRequested = true
        await sender.sendMessage(msg.from_user_id, "正在等待当前任务完成，完成后将中止", msg.context_token)
        continue
      }

      const r = await router.route(botStatus as any, msg.text, msg.from_user_id, msg.context_token)

      if (r.action === "enqueue") {
        const reply = await processPrompt(session, msg.text, runtime?.session_id ?? "")
        if (abortRequested) {
          abortRequested = false
          await sender.sendMessage(msg.from_user_id, "当前任务已完成，后续消息已中止", msg.context_token)
          continue
        }
        await sender.sendAdaptive(msg.from_user_id, reply, msg.context_token)
      } else if (r.action === "reply") {
        await sender.sendMessage(msg.from_user_id, r.text, msg.context_token)
      } else if (r.action === "select_project") {
        const reply = await handlers.selectProject(msg.text, msg.from_user_id, msg.context_token)
        botStatus = "SESSION_SELECT"
        await sender.sendMessage(msg.from_user_id, reply, msg.context_token)
      } else if (r.action === "select_session") {
        const reply = await handlers.selectSession(msg.text, msg.from_user_id, msg.context_token)
        botStatus = "READY"
        await sender.sendMessage(msg.from_user_id, reply, msg.context_token)
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (cmd === "login") {
    const login = createLoginClient()
    const session = await login.waitForLogin()
    console.log(`登录成功: ${session.account_id}`)
    return
  }

  if (cmd === "start") {
    const config = await loadConfig("wechat-opencode.json")
    const state = new StateStore(config.wechat.state_dir)
    const login = createLoginClient()
    const session = createSessionClient({ baseUrl: config.opencode.base_url })
    const acct = await state.getAccount()
    const token = acct?.token ?? ""
    const sender = createSender(token)
    const poller = createPoller(token)
    const handlers = createCommandHandlers({ sender, session, state })
    const router = createRouter(handlers)
    await startBridge({
      config, state, login, session, sender, poller, handlers, router,
    })
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

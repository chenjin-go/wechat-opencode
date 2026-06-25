import { getDefaultConfig } from "./src/config"
import { StateStore } from "./src/state"
import { createSessionClient } from "./src/session"

const promptText = process.argv.slice(2).join(" ")
if (!promptText) {
  console.log("用法: bun run opencode-async.ts <prompt>")
  process.exit(1)
}

const config = getDefaultConfig()
const state = new StateStore(config.wechat.state_dir)
const session = createSessionClient(config.opencode.base_url)

let runtime = (await state.getRuntime()) ?? {}
let sessionId = runtime.session_id

async function resolveSessionDir(): Promise<string | undefined> {
  const cur = await session.getCurrentProject()
  if (cur?.worktree) return cur.worktree
  const projects = await session.listProjects()
  return projects[0]?.worktree
}

async function createSessionWithDir(): Promise<string> {
  const dir = await resolveSessionDir()
  const id = await session.createSession(dir)
  return id
}

if (!sessionId) {
  sessionId = await createSessionWithDir()
  runtime = { ...runtime, session_id: sessionId }
  await state.setRuntime(runtime)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function doPrompt(sid: string): Promise<string> {
  await session.promptAsync(sid, promptText, runtime.model)
  for (let i = 0; i < 120; i++) {
    await sleep(1000)
    const messages = await session.getMessages(sid)
    const reply = session.extractAssistantText(messages)
    if (reply) return reply
  }
  throw new Error("等待 AI 回复超时")
}

async function main() {
  let reply: string
  try {
    reply = await doPrompt(sessionId!)
  } catch {
    sessionId = await createSessionWithDir()
    runtime = { ...runtime, session_id: sessionId }
    await state.setRuntime(runtime)
    reply = await doPrompt(sessionId!)
  }
  console.log(reply)
}

main().catch((e) => {
  console.error("opencode-async.ts error:", e)
  process.exit(1)
})

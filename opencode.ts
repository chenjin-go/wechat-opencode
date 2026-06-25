import { getDefaultConfig } from "./src/config"
import { StateStore } from "./src/state"
import { createSessionClient } from "./src/session"

const promptText = process.argv.slice(2).join(" ")
if (!promptText) {
  console.log("用法: bun run opencode.ts <prompt>")
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

async function doPrompt(sid: string): Promise<string> {
  return session.promptAndWait(sid, promptText, runtime.model)
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
  console.error("opencode.ts error:", e)
  process.exit(1)
})

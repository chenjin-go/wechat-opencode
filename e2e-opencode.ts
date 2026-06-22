import { loadConfig } from "./src/config"
import { createSessionClient } from "./src/session"

async function main() {
  const cfg = await loadConfig("wechat-opencode.json")
  console.log("Config OK:", cfg.opencode.base_url)

  const client = createSessionClient({ baseUrl: cfg.opencode.base_url })

  const projects = await client.listProjects()
  console.log(`Projects: ${projects.length}`)
  const proj = projects.find(p => p.worktree.includes("wechat-opencode")) ?? projects[0]
  console.log(`Using: ${proj.name ?? proj.id} (${proj.worktree})`)

  const sessionId = await client.createSession(proj.worktree)
  console.log(`Session: ${sessionId}`)

  await client.prompt(sessionId, "用中文回复：你好，请用一句话描述你自己。")
  console.log("Prompt sent, waiting...")

  await client.wait(sessionId)
  console.log("Response ready")

  const messages = await client.getMessages(sessionId)
  const reply = client.extractAssistantText(messages)
  console.log(`Reply: ${reply ?? "(none)"}`)
}

main().catch(console.error)

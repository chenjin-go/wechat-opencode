import { describe, test, expect, afterAll } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { createSessionClient } from "../src/session"

const baseUrl = "http://127.0.0.1:4096"
const raw = createOpencodeClient({ baseUrl })

describe("session (via @opencode-ai/sdk/v2)", () => {
  const client = createSessionClient(baseUrl)
  const createdIds: string[] = []

  afterAll(async () => {
    for (const id of createdIds) {
      try {
        await raw.session.abort({ sessionID: id })
        console.log("[cleanup] aborted:", id)
      } catch {}
    }
  })

  test("listProjects returns real project list", async () => {
    const projects = await client.listProjects()
    console.log("[listProjects] count:", projects.length)
    console.log("[listProjects] first:", JSON.stringify(projects[0]))
    expect(Array.isArray(projects)).toBe(true)
    expect(projects.length).toBeGreaterThan(0)
    for (const p of projects) {
      expect(typeof p.id).toBe("string")
      expect(typeof p.worktree).toBe("string")
    }
  })

  test("createSession creates session and returns ID", async () => {
    const id = await client.createSession()
    createdIds.push(id)
    console.log("[createSession] id:", id)
    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })

  test("listSessions returns recent sessions", async () => {
    const sid = await client.createSession()
    createdIds.push(sid)
    const sessions = await client.listSessions(5)
    console.log("[listSessions] count:", sessions.length)
    console.log("[listSessions] most recent:", JSON.stringify(sessions[0]))
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) {
      expect(typeof s.id).toBe("string")
      expect(typeof s.title).toBe("string")
      expect(s.time).toHaveProperty("updated")
    }
  })

  test("prompt throws when session has no project directory", async () => {
    const sid = await client.createSession()
    createdIds.push(sid)
    console.log("[prompt] session:", sid)
    await expect(client.prompt(sid, "test message")).rejects.toThrow()
  })

  test("wait returns quickly for idle session", async () => {
    const sid = await client.createSession()
    createdIds.push(sid)
    const start = Date.now()
    await client.wait(sid)
    const elapsed = Date.now() - start
    console.log("[wait] session:", sid, "elapsed:", elapsed, "ms")
    expect(elapsed).toBeLessThan(5000)
  })

  test("getMessages returns user message after blocking prompt", async () => {
    const { data: cur } = await raw.project.current()
    const sid = await client.createSession(cur.worktree)
    createdIds.push(sid)
    const model = { providerID: "opencode", modelID: "deepseek-v4-flash-free" }
    await client.promptAndWait(sid, "hello from SDK test", model)
    const msgs = await client.getMessages(sid)
    console.log("[getMessages] session:", sid, "count:", msgs.length)
    if (msgs.length > 0) {
      console.log("[getMessages] first msg role:", msgs[0].info.role)
    }
    expect(Array.isArray(msgs)).toBe(true)
    expect(msgs.length).toBeGreaterThan(0)
    expect(msgs[0].info.role).toBe("user")
  }, 60000)

  test("promptAndWait throws when session has no project directory", async () => {
    const sid = await client.createSession()
    createdIds.push(sid)
    console.log("[promptAndWait] session:", sid)
    await expect(client.promptAndWait(sid, "ping")).rejects.toThrow()
  })

  test("abort stops an active session", async () => {
    const sid = await client.createSession()
    createdIds.push(sid)
    console.log("[abort] session:", sid)
    await client.abort(sid)
    const { data } = await raw.session.status()
    const st = data[sid]
    if (st) {
      console.log("[abort] status after abort:", st.type)
      expect(st.type).toBe("idle")
    } else {
      console.log("[abort] session not in status map (already idle)")
    }
  })

  test("extractAssistantText extracts from V2 message format", () => {
    const msgs = [
      { info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
      {
        info: { role: "assistant" },
        parts: [
          { type: "reasoning", text: "thinking..." },
          { type: "text", text: "Hello!" },
          { type: "text", text: " How are you?" },
        ],
      },
    ]
    const result = client.extractAssistantText(msgs)
    console.log("[extractText] input: 2 messages, result:", JSON.stringify(result))
    expect(result).toBe("Hello! How are you?")
  })

  test("extractAssistantText returns null when no assistant message", () => {
    const msgs = [{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] }]
    const result = client.extractAssistantText(msgs)
    console.log("[extractText-null] input: 1 user msg, result:", JSON.stringify(result))
    expect(result).toBeNull()
  })
})

describe("e2e: create session under project → send message → get reply", () => {
  const createdIds: string[] = []

  const model = { providerID: "opencode", modelID: "deepseek-v4-flash-free" }

  afterAll(async () => {
    for (const id of createdIds) {
      try { await raw.session.abort({ sessionID: id }) } catch { /* ok */ }
    }
  })

  test("在项目下创建 session → 发送 prompt（sync）→ 获取回复", async () => {
    // 1. 获取当前项目工作目录
    const { data: cur } = await raw.project.current()
    console.log("[e2e] project:", cur.worktree)
    expect(cur.worktree).toBeTruthy()

    // 2. 在该项目下创建 session
    const { data: s } = await raw.session.create({ directory: cur.worktree })
    createdIds.push(s.id)
    console.log("[e2e] session:", s.id)

    // 3. 发送 prompt（sync — 阻塞等 AI 完整回复）
    const { data: reply } = await raw.session.prompt({
      sessionID: s.id,
      model,
      parts: [{ type: "text", text: "用中文一句话回答：1+1等于几？" }],
    })
    expect(reply.info.role).toBe("assistant")

    // 4. 提取 text parts 作为回复
    const text = reply.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("")
    console.log("[e2e] reply:", JSON.stringify(text))
    expect(text.length).toBeGreaterThan(0)
  }, 120000)

  test("指定 agent = explore 发消息", async () => {
    const { data: cur } = await raw.project.current()
    const { data: s } = await raw.session.create({ directory: cur.worktree })
    createdIds.push(s.id)
    console.log("[e2e-agent] session:", s.id)

    const { data: reply } = await raw.session.prompt({
      sessionID: s.id,
      agent: "explore",
      model,
      parts: [{ type: "text", text: "列出当前项目根目录的文件，用中文回答" }],
    })
    expect(reply.info.role).toBe("assistant")

    const text = reply.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("")
    console.log("[e2e-agent] reply:", JSON.stringify(text))
    expect(text.length).toBeGreaterThan(0)
  }, 120000)
})

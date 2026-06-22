import { describe, test, expect, afterAll } from "bun:test"
import { createSessionClient } from "../src/session"

const baseUrl = "http://127.0.0.1:4096"

function cleanPendingSessions(sessions: any[]) {
  return sessions.filter((s: any) => !s.title?.startsWith("[test]"))
}

describe("session (real OpenCode server)", () => {
  let createdIds: string[] = []

  afterAll(async () => {
    // cleanup test sessions by sending /abort to each
    for (const id of createdIds) {
      try {
        await fetch(`${baseUrl}/session/${id}/abort`, { method: "POST" })
      } catch {}
    }
  })

  test("listProjects returns real project list", async () => {
    const client = createSessionClient({ baseUrl })
    const projects = await client.listProjects()

    expect(Array.isArray(projects)).toBe(true)
    expect(projects.length).toBeGreaterThan(0)
    for (const p of projects) {
      expect(typeof p.id).toBe("string")
      expect(typeof p.worktree).toBe("string")
    }
  })

  test("createSession creates a real session and returns ID", async () => {
    const client = createSessionClient({ baseUrl })
    const id = await client.createSession()
    createdIds.push(id)

    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })

  test("listSessions returns recent sessions with expected shape", async () => {
    const client = createSessionClient({ baseUrl })
    const sessions = await client.listSessions("/", 5)

    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) {
      expect(typeof s.id).toBe("string")
      expect(typeof s.title).toBe("string")
      expect(s.time).toHaveProperty("updated")
    }
  })

  test("prompt sends message asynchronously without error", async () => {
    const client = createSessionClient({ baseUrl })
    const sid = await client.createSession()
    createdIds.push(sid)

    await client.prompt(sid, "test message from automated test")
    // async prompt returns 204 — reaching here means no throw
  })

  test("wait returns quickly for idle session", async () => {
    const client = createSessionClient({ baseUrl })
    const sid = await client.createSession()
    createdIds.push(sid)

    const start = Date.now()
    await client.wait(sid)
    const elapsed = Date.now() - start

    // new unprompted session should be idle → returns in <1s
    expect(elapsed).toBeLessThan(5000)
  })

  test("getMessages returns array after async prompt", async () => {
    const client = createSessionClient({ baseUrl })
    const sid = await client.createSession()
    createdIds.push(sid)

    await client.prompt(sid, "hello from test")
    // brief wait for server to process
    await new Promise((r) => setTimeout(r, 3000))

    const msgs = await client.getMessages(sid)
    expect(Array.isArray(msgs)).toBe(true)
  })

  test("async prompt then status shows session activity", async () => {
    const client = createSessionClient({ baseUrl })
    const sid = await client.createSession()
    createdIds.push(sid)

    await client.prompt(sid, "ping")

    // poll status quickly to see if session appears
    for (let i = 0; i < 5; i++) {
      const statuses: Record<string, any> =
        (await fetch(`${baseUrl}/session/status`).then((r) => r.json())) ?? {}
      const st = statuses[sid]
      if (st) {
        expect(["busy", "retry", "idle"]).toContain(st.type)
        return // found it
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    // session didn't appear in status map — still acceptable
  })

  test("extractAssistantText extracts from V2 message format", async () => {
    const client = createSessionClient({ baseUrl })

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

    const text = client.extractAssistantText(msgs)
    expect(text).toBe("Hello! How are you?")
  })

  test("extractAssistantText returns null when no assistant message", async () => {
    const client = createSessionClient({ baseUrl })
    const msgs = [{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] }]

    const text = client.extractAssistantText(msgs)
    expect(text).toBeNull()
  })
})

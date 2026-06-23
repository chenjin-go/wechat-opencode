import { describe, test, expect, mock } from "bun:test"

function delay(ms = 20) {
  return new Promise((r) => setTimeout(r, ms))
}

function mockBot() {
  let handler: ((msg: any) => Promise<void>) | null = null
  const bot: Record<string, any> = {
    login: mock(() =>
      Promise.resolve({
        token: "tok1",
        baseUrl: "http://localhost:4096",
        accountId: "acct1",
        userId: "u1",
        savedAt: new Date().toISOString(),
      }),
    ),
    onMessage: mock((h: any) => {
      handler = h
    }),
    start: mock(() => Promise.resolve()),
    stop: mock(() => {}),
    reply: mock(() => Promise.resolve()),
    send: mock(() => Promise.resolve()),
    getCredentials: mock(() => undefined),
    _trigger: async (msg: any) => {
      if (handler) await handler(msg)
    },
  }
  return bot
}

describe("processPrompt", () => {
  test("returns assistant reply text", async () => {
    const { processPrompt } = await import("../src/index")

    const session = {
      promptAndWait: mock(() => Promise.resolve("Hello!")),
    }

    const result = await processPrompt(session as any, "hi", "sess-1")
    expect(result).toBe("Hello!")
    expect(session.promptAndWait).toHaveBeenCalledWith("sess-1", "hi", undefined)
  })

  test("passes model to promptAndWait when specified", async () => {
    const { processPrompt } = await import("../src/index")

    const session = {
      promptAndWait: mock(() => Promise.resolve("AI reply")),
    }

    const model = { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" }
    const result = await processPrompt(session as any, "hi", "sess-1", model)
    expect(result).toBe("AI reply")
    expect(session.promptAndWait).toHaveBeenCalledWith("sess-1", "hi", model)
  })
})

describe("startBridge", () => {
  function mockState(overrides: Record<string, any> = {}) {
    return {
      setAccount: mock(() => Promise.resolve()),
      getProject: mock(() => Promise.resolve(null)),
      setProject: mock(() => Promise.resolve()),
      getRuntime: mock(() => Promise.resolve(null)),
      setRuntime: mock(() => Promise.resolve()),
      ...overrides,
    }
  }

  function mockSession(overrides: Record<string, any> = {}) {
    return {
      listProjects: mock(() =>
        Promise.resolve([{ id: "p1", worktree: "/proj", name: "Proj" }]),
      ),
      listSessions: mock(() =>
        Promise.resolve([
          { id: "s1", title: "Session 1", time: { updated: "2024-01-01T00:00:00Z" } },
        ]),
      ),
      createSession: mock(() => Promise.resolve("ses_new")),
      promptAndWait: mock(() => Promise.resolve("AI reply")),
      ...overrides,
    }
  }

  test("normal message flow: enqueue -> processPrompt -> reply", async () => {
    const { startBridge } = await import("../src/index")
    const bot = mockBot()
    const state = mockState({
      getProject: mock(() =>
        Promise.resolve({ project_id: "p1", dir: "/proj", name: "Proj" }),
      ),
      getRuntime: mock(() =>
        Promise.resolve({ session_id: "sess-1" }),
      ),
    })
    const session = mockSession()

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(bot as any, state as any, session as any, ac.signal)

    await bot._trigger({ text: "hello", userId: "u1", _contextToken: "tok" })
    await delay(50)

    expect(bot.login).toHaveBeenCalled()
    expect(state.setAccount).toHaveBeenCalled()
    expect(bot.onMessage).toHaveBeenCalled()
    expect(bot.start).toHaveBeenCalled()
    expect(session.promptAndWait).toHaveBeenCalledWith("sess-1", "hello", undefined)
    expect(bot.reply).toHaveBeenCalled()
  })

  test("command reply flow: /help -> reply", async () => {
    const { startBridge } = await import("../src/index")
    const bot = mockBot()
    const state = mockState({
      getProject: mock(() =>
        Promise.resolve({ project_id: "p1", dir: "/proj", name: "Proj" }),
      ),
      getRuntime: mock(() =>
        Promise.resolve({ session_id: "sess-1" }),
      ),
    })
    const session = mockSession()

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(bot as any, state as any, session as any, ac.signal)

    await bot._trigger({ text: "/help", userId: "u1", _contextToken: "tok" })
    await delay(50)

    expect(bot.reply).toHaveBeenCalled()
    const replyCall = bot.reply.mock.calls[0]?.[1] || ""
    expect(replyCall).toContain("/help")
    expect(replyCall).toContain("/status")
    expect(session.promptAndWait).not.toHaveBeenCalled()
  })

  test("enqueue with no session prompts user to select project/session", async () => {
    const { startBridge } = await import("../src/index")
    const bot = mockBot()
    const state = mockState()
    const session = mockSession()

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(bot as any, state as any, session as any, ac.signal)

    await bot._trigger({ text: "hello", userId: "u1", _contextToken: "tok" })
    await delay(50)

    expect(bot.reply).toHaveBeenCalled()
    const replyText = bot.reply.mock.calls[0]?.[1] || ""
    expect(replyText).toContain("请先选择项目和会话")
    expect(session.promptAndWait).not.toHaveBeenCalled()
  })

  test("requires login when no saved account", async () => {
    const { startBridge } = await import("../src/index")
    const bot = mockBot()
    const state = mockState()
    const session = mockSession()

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(bot as any, state as any, session as any, ac.signal)

    expect(bot.login).toHaveBeenCalled()
    expect(state.setAccount).toHaveBeenCalled()
  })
})

import { describe, test, expect, mock } from "bun:test"

function delay(ms = 20) {
  return new Promise((r) => setTimeout(r, ms))
}

describe("processPrompt", () => {
  test("returns assistant reply text", async () => {
    const { processPrompt } = await import("../src/index")

    const session = {
      prompt: mock(() => Promise.resolve()),
      wait: mock(() => Promise.resolve()),
      getMessages: mock(() =>
        Promise.resolve([{ role: "assistant", content: [{ type: "text", text: "Hello!" }] }]),
      ),
      extractAssistantText: mock((msgs: any[]) => "Hello!"),
    }

    const result = await processPrompt(session as any, "hi", "sess-1")
    expect(result).toBe("Hello!")
    expect(session.prompt).toHaveBeenCalledWith("sess-1", "hi")
    expect(session.wait).toHaveBeenCalledWith("sess-1")
    expect(session.getMessages).toHaveBeenCalledWith("sess-1")
  })

  test("returns fallback when extractAssistantText returns null", async () => {
    const { processPrompt } = await import("../src/index")

    const session = {
      prompt: mock(() => Promise.resolve()),
      wait: mock(() => Promise.resolve()),
      getMessages: mock(() => Promise.resolve([])),
      extractAssistantText: mock(() => null),
    }

    const result = await processPrompt(session as any, "hi", "sess-1")
    expect(result).toBe("AI 未产生文本回复")
  })
})

describe("startBridge", () => {
  function makeCtx(overrides: Record<string, any> = {}) {
    const base = {
      config: {
        opencode: { base_url: "http://localhost:4096" },
        wechat: { state_dir: "/tmp/state", poll_interval_ms: 35000, max_reply_chars: 2000 },
      },
      state: {
        getAccount: mock(() => Promise.resolve(null)),
        setAccount: mock(() => Promise.resolve()),
        getProject: mock(() => Promise.resolve(null)),
        setProject: mock(() => Promise.resolve()),
        getRuntime: mock(() => Promise.resolve(null)),
        setRuntime: mock(() => Promise.resolve()),
      },
      login: {
        waitForLogin: mock(() =>
          Promise.resolve({ account_id: "acct1", token: "tok1", base_url: "http://localhost:4096" }),
        ),
      },
      session: {
        prompt: mock(() => Promise.resolve()),
        wait: mock(() => Promise.resolve()),
        getMessages: mock(() => Promise.resolve([])),
        extractAssistantText: mock(() => "AI reply"),
      },
      sender: {
        sendMessage: mock(() => Promise.resolve()),
        sendAdaptive: mock(() => Promise.resolve()),
        setToken: mock(() => {}),
      },
      poller: {
        poll: mock(() => delay().then(() => ({ messages: [], buf: "", error: null }))),
        setToken: mock(() => {}),
      },
      handlers: {
        help: mock(() => "可用命令:\n/help - 帮助\n/status - 运行状态\n/new - 新建会话\n/projects - 切换项目\n/sessions - 切换会话\n/abort - 中止当前 AI 任务"),
        status: mock(() => "状态信息"),
        newSession: mock(() => "新会话已创建"),
        projects: mock(() => "项目列表"),
        listSessions: mock(() => "会话列表"),
        selectProject: mock((id: string) => "项目列表，请回复编号"),
        selectSession: mock((id: string) => "会话列表，请回复编号"),
      },
      router: {
        route: mock(() => Promise.resolve({ action: "reply", text: "ok" })),
      },
      ...overrides,
    }
    return base
  }

  test("handles normal message flow: poll -> enqueue -> send adaptive", async () => {
    const { startBridge } = await import("../src/index")

    const ctx = makeCtx({
      state: {
        getAccount: mock(() =>
          Promise.resolve({ account_id: "acct1", token: "tok1", base_url: "x", saved_at: "2024-01-01" }),
        ),
        getProject: mock(() =>
          Promise.resolve({ project_id: "p1", dir: "/proj", name: "Proj" }),
        ),
        getRuntime: mock(() =>
          Promise.resolve({ status: "READY", session_id: "sess-1" }),
        ),
        setRuntime: mock(() => Promise.resolve()),
      },
      router: {
        route: mock(() => Promise.resolve({ action: "enqueue", text: "hello" })),
      },
      poller: {
        poll: mock(() =>
          delay().then(() => ({
            messages: [{ text: "hello", from_user_id: "u1", context_token: "tok" }],
            buf: "b1",
            error: null,
          })),
        ),
        setToken: mock(() => {}),
      },
    })

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(ctx as any, ac.signal)

    expect(ctx.poller.poll).toHaveBeenCalled()
    expect(ctx.router.route).toHaveBeenCalledWith("READY", "hello", "u1", "tok")
    expect(ctx.session.prompt).toHaveBeenCalledWith("sess-1", "hello")
    expect(ctx.sender.sendAdaptive).toHaveBeenCalledWith("u1", "AI reply", "tok")
  })

  test("handles command reply flow: poll -> route command -> send reply", async () => {
    const { startBridge } = await import("../src/index")

    const ctx = makeCtx({
      state: {
        getAccount: mock(() =>
          Promise.resolve({ account_id: "acct1", token: "tok1", base_url: "x", saved_at: "2024-01-01" }),
        ),
        getProject: mock(() =>
          Promise.resolve({ project_id: "p1", dir: "/proj", name: "Proj" }),
        ),
        getRuntime: mock(() =>
          Promise.resolve({ status: "READY", session_id: "sess-1" }),
        ),
        setRuntime: mock(() => Promise.resolve()),
      },
      router: {
        route: mock(() => Promise.resolve({ action: "reply", text: "帮助信息" })),
      },
      poller: {
        poll: mock(() =>
          delay().then(() => ({
            messages: [{ text: "/help", from_user_id: "u1", context_token: "tok" }],
            buf: "",
            error: null,
          })),
        ),
        setToken: mock(() => {}),
      },
    })

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(ctx as any, ac.signal)

    expect(ctx.router.route).toHaveBeenCalledWith("READY", "/help", "u1", "tok")
    expect(ctx.sender.sendMessage).toHaveBeenCalledWith("u1", "帮助信息", "tok")
    expect(ctx.session.prompt).not.toHaveBeenCalled()
  })

  test("handles NO_PROJECT state: select project then transition", async () => {
    const { startBridge } = await import("../src/index")

    const ctx = makeCtx({
      state: {
        getAccount: mock(() =>
          Promise.resolve({ account_id: "acct1", token: "tok1", base_url: "x", saved_at: "2024-01-01" }),
        ),
        getProject: mock(() => Promise.resolve(null)),
        getRuntime: mock(() => Promise.resolve(null)),
        setProject: mock(() => Promise.resolve()),
        setRuntime: mock(() => Promise.resolve()),
      },
      router: {
        route: mock(() => Promise.resolve({ action: "select_project", text: "请选择项目" })),
      },
      poller: {
        poll: mock(() =>
          delay().then(() => ({
            messages: [{ text: "1", from_user_id: "u1", context_token: "tok" }],
            buf: "",
            error: null,
          })),
        ),
        setToken: mock(() => {}),
      },
      handlers: {
        selectProject: mock(() => "已选择项目，请选择会话"),
        selectSession: mock(() => "会话列表，请回复"),
      },
    })

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(ctx as any, ac.signal)

    expect(ctx.handlers.selectProject).toHaveBeenCalledWith("1", "u1", "tok")
    expect(ctx.sender.sendMessage).toHaveBeenCalledWith("u1", "已选择项目，请选择会话", "tok")
  })

  test("handles SESSION_EXPIRED poll error: re-login and setToken", async () => {
    const { startBridge } = await import("../src/index")

    let callCount = 0
    const poll = mock(() => {
      callCount++
      if (callCount === 1) return delay().then(() => ({ messages: [], buf: "", error: "SESSION_EXPIRED" }))
      return delay().then(() => ({ messages: [], buf: "", error: null }))
    })

    const ctx = makeCtx({
      state: {
        getAccount: mock(() =>
          Promise.resolve({ account_id: "acct1", token: "tok1", base_url: "x", saved_at: "2024-01-01" }),
        ),
        getProject: mock(() =>
          Promise.resolve({ project_id: "p1", dir: "/proj", name: "Proj" }),
        ),
        getRuntime: mock(() =>
          Promise.resolve({ status: "READY", session_id: "sess-1" }),
        ),
        setAccount: mock(() => Promise.resolve()),
        setRuntime: mock(() => Promise.resolve()),
      },
      poller: { poll, setToken: mock(() => {}) },
      login: {
        waitForLogin: mock(() =>
          Promise.resolve({ account_id: "acct2", token: "tok2", base_url: "http://localhost:4096" }),
        ),
      },
    })

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 300)
    await startBridge(ctx as any, ac.signal)

    expect(ctx.login.waitForLogin).toHaveBeenCalled()
    expect(ctx.state.setAccount).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "acct2", token: "tok2" }),
    )
    expect(ctx.sender.setToken).toHaveBeenCalledWith("tok2")
    expect(ctx.poller.setToken).toHaveBeenCalledWith("tok2")
  })

  test("requires login when no saved account", async () => {
    const { startBridge } = await import("../src/index")

    const ctx = makeCtx({
      state: {
        getAccount: mock(() => Promise.resolve(null)),
        setAccount: mock(() => Promise.resolve()),
        getProject: mock(() => Promise.resolve(null)),
        getRuntime: mock(() => Promise.resolve(null)),
        setRuntime: mock(() => Promise.resolve()),
      },
    })

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(ctx as any, ac.signal)

    expect(ctx.login.waitForLogin).toHaveBeenCalled()
    expect(ctx.state.setAccount).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "acct1", token: "tok1" }),
    )
  })

  test("aborts after current message finishes, skips subsequent messages", async () => {
    const { startBridge } = await import("../src/index")

    let firstBatch = true
    const ctx = makeCtx({
      state: {
        getAccount: mock(() =>
          Promise.resolve({ account_id: "acct1", token: "tok1", base_url: "x", saved_at: "2024-01-01" }),
        ),
        getProject: mock(() =>
          Promise.resolve({ project_id: "p1", dir: "/proj", name: "Proj" }),
        ),
        getRuntime: mock(() =>
          Promise.resolve({ status: "READY", session_id: "sess-1" }),
        ),
        setRuntime: mock(() => Promise.resolve()),
      },
      router: {
        route: mock(() => Promise.resolve({ action: "enqueue", text: "hi" })),
      },
      poller: {
        poll: mock(() => {
          if (firstBatch) {
            firstBatch = false
            return delay().then(() => ({
              messages: [
                { text: "hello", from_user_id: "u1", context_token: "tok1" },
                { text: "/abort", from_user_id: "u1", context_token: "tok2" },
                { text: "world", from_user_id: "u1", context_token: "tok3" },
              ],
              buf: "",
              error: null,
            }))
          }
          return delay().then(() => ({ messages: [], buf: "", error: null }))
        }),
        setToken: mock(() => {}),
      },
    })

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 200)
    await startBridge(ctx as any, ac.signal)

    expect(ctx.session.prompt).toHaveBeenCalledTimes(1)
    expect(ctx.session.prompt).toHaveBeenCalledWith("sess-1", "hello")
    expect(ctx.sender.sendMessage).toHaveBeenCalledWith("u1", "正在等待当前任务完成，完成后将中止", "tok2")
    expect(ctx.sender.sendAdaptive).toHaveBeenCalledTimes(1)
    expect(ctx.sender.sendAdaptive).toHaveBeenCalledWith("u1", "AI reply", "tok1")
  })
})

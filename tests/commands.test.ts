import { describe, test, expect, mock } from "bun:test"
import { createCommandHandlers } from "../src/commands"

describe("commands", () => {
  const mockSender = {
    sendMessage: mock(() => Promise.resolve(true)),
    sendAdaptive: mock(() => Promise.resolve(true)),
  }
  const mockSession = {
    listProjects: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve("ses_new")),
    listSessions: mock(() => Promise.resolve([])),
  }
  const mockState = {
    getProject: mock(() => Promise.resolve(null)),
    setProject: mock(() => Promise.resolve()),
    getRuntime: mock(() => Promise.resolve(null)),
    setRuntime: mock(() => Promise.resolve()),
  }

  function makeHandlers() {
    return createCommandHandlers({
      sender: mockSender as any,
      session: mockSession as any,
      state: mockState as any,
    })
  }

  test("help returns static text", async () => {
    const handlers = makeHandlers()
    const result = await handlers.help("user", "ctx_1")
    expect(result).toContain("/help")
    expect(result).toContain("/status")
  })

  test("projects lists projects from session API", async () => {
    mockSession.listProjects.mockResolvedValue([
      { id: "p1", worktree: "/a", name: "Project A" },
      { id: "p2", worktree: "/b" },
    ])
    mockState.getProject.mockResolvedValue({ project_id: "p1", dir: "/a", name: "Project A" })

    const handlers = makeHandlers()
    const result = await handlers.projects("user", "ctx_2")

    expect(result).toContain("Project A")
    expect(result).toContain("p2")
  })

  test("new creates session and returns confirmation", async () => {
    mockState.getProject.mockResolvedValue({ project_id: "p_a", dir: "/a", name: "A" })

    const handlers = makeHandlers()
    const result = await handlers.newSession("user", "ctx_3")

    expect(mockSession.createSession).toHaveBeenCalledWith()
    expect(result).toContain("ses_new")
  })

  test("new returns error if no project selected", async () => {
    mockState.getProject.mockResolvedValue(null)

    const handlers = makeHandlers()
    const result = await handlers.newSession("user", "ctx_3")

    expect(result).toContain("请先选择项目")
  })

  test("sessions lists sessions for current project", async () => {
    mockState.getProject.mockResolvedValue({ project_id: "p_a", dir: "/a", name: "A" })
    mockSession.listSessions.mockResolvedValue([
      { id: "s1", title: "Fix bug", time: { updated: "2026-06-21T10:00:00Z" } },
    ])

    const handlers = makeHandlers()
    const result = await handlers.listSessions("user", "ctx_4")

    expect(result).toContain("Fix bug")
    expect(result).toContain("new")
  })
})

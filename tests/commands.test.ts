import { describe, test, expect, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { createCommandHandlers } from "../src/commands"
import { createSessionClient } from "../src/session"
import { StateStore } from "../src/state"

const baseUrl = "http://127.0.0.1:4096"
const session = createSessionClient(baseUrl)

const tmpDirs: string[] = []

function freshState(): StateStore {
  const d = mkdtempSync(join(tmpdir(), "wechat-cmds-"))
  tmpDirs.push(d)
  return new StateStore(d)
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true }) } catch {}
  }
})

describe("commands (real OpenCode + StateStore)", () => {
  function h(store?: StateStore) {
    return createCommandHandlers({ session: session as any, state: store ?? freshState() })
  }

  test("help returns static text with all commands", () => {
    const result = h().help("user", "ctx")
    console.log("[help] output:", JSON.stringify(result))
    expect(result).toContain("/help")
    expect(result).toContain("/status")
    expect(result).toContain("/projects")
    expect(result).toContain("/sessions")
    expect(result).toContain("/model")
  })

  test("status shows unselected state when nothing configured", async () => {
    const result = await h().status("user", "ctx")
    console.log("[status-unselected] output:", JSON.stringify(result))
    expect(result).toContain("未选择")
  })

  test("status shows selected project and session", async () => {
    const s = freshState()
    await s.setProject({ project_id: "proj_x", dir: "/x", name: "TestProj" })
    await s.setRuntime({ session_id: "ses_xxx" })
    const result = await h(s).status("user", "ctx")
    console.log("[status-configured] output:", JSON.stringify(result))
    expect(result).toContain("TestProj")
    expect(result).toContain("ses_xxx")
  })

  test("newSession creates real session when project selected", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    const p = projs[0]
    await s.setProject({ project_id: p.id, dir: p.worktree, name: p.name || p.id })
    const result = await h(s).newSession("user", "ctx")
    console.log("[newSession] output:", JSON.stringify(result))
    expect(result).toContain("新会话已创建")
    const rt = await s.getRuntime()
    console.log("[newSession] runtime:", JSON.stringify(rt))
    expect(rt?.session_id).toMatch(/^ses_/)
  })

  test("newSession errors when no project selected", async () => {
    const result = await h().newSession("user", "ctx")
    console.log("[newSession-noProject] output:", JSON.stringify(result))
    expect(result).toContain("请先选择项目")
  })

  test("projects lists real projects from OpenCode", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    console.log("[projects] total projects:", projs.length)
    await s.setProject({ project_id: projs[0].id, dir: projs[0].worktree, name: projs[0].name || projs[0].id })
    const result = await h(s).projects("user", "ctx")
    console.log("[projects] output:", JSON.stringify(result.substring(0, 300)))
    expect(result).toContain("可用项目")
    expect(result).toContain(projs[0].worktree)
  })

  test("projects with arg selects real project and sets state", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    const p = projs[0]
    console.log("[projects-select] target:", p.id, p.name || p.id)
    const result = await h(s).projects("user", "ctx", p.id)
    console.log("[projects-select] output:", JSON.stringify(result))
    expect(result).toContain("已选择项目")
    expect(result).toContain(p.name || p.id)
    const stored = await s.getProject()
    console.log("[projects-select] stored:", JSON.stringify(stored))
    expect(stored?.project_id).toBe(p.id)
  })

  test("projects with arg returns error for unknown project", async () => {
    const result = await h().projects("user", "ctx", "nonexistent")
    console.log("[projects-unknown] output:", JSON.stringify(result))
    expect(result).toContain("未找到项目")
  })

  test("projects with number arg selects by index", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    const result = await h(s).projects("user", "ctx", "1")
    console.log("[projects-byNumber] output:", JSON.stringify(result))
    expect(result).toContain("已选择项目")
    const stored = await s.getProject()
    expect(stored?.project_id).toBe(projs[0].id)
  })

  test("listSessions shows recent sessions", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    await s.setProject({ project_id: projs[0].id, dir: projs[0].worktree, name: projs[0].name || projs[0].id })
    await session.createSession()
    const result = await h(s).listSessions("user", "ctx")
    console.log("[listSessions] output:", JSON.stringify(result.substring(0, 300)))
    expect(result).toContain(projs[0].worktree)
  })

  test("listSessions errors when no project selected", async () => {
    const result = await h().listSessions("user", "ctx")
    console.log("[listSessions-noProject] output:", JSON.stringify(result))
    expect(result).toContain("请先选择项目")
  })

  test("listSessions by number selects from recent sessions", async () => {
    const s = freshState()
    await session.createSession()
    const projs = await session.listProjects()
    await s.setProject({ project_id: projs[0].id, dir: projs[0].worktree, name: projs[0].name || projs[0].id })

    const result = await h(s).listSessions("user", "ctx", "1")
    console.log("[listSessions-byNumber] output:", JSON.stringify(result))
    expect(result).toContain("已选择会话")
    const rt = await s.getRuntime()
    console.log("[listSessions-byNumber] runtime:", JSON.stringify(rt))
    expect(rt?.session_id).toBeTruthy()
  })

  test("listSessions with 'new' creates new session and sets runtime", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    await s.setProject({ project_id: projs[0].id, dir: projs[0].worktree, name: projs[0].name || projs[0].id })
    const result = await h(s).listSessions("user", "ctx", "new")
    console.log("[listSessions-new] output:", JSON.stringify(result))
    expect(result).toContain("新会话已创建")
    const rt = await s.getRuntime()
    console.log("[listSessions-new] runtime:", JSON.stringify(rt))
    expect(rt?.session_id).toMatch(/^ses_/)
  })

  test("listSessions errors when no project and arg provided", async () => {
    const result = await h().listSessions("user", "ctx", "1")
    console.log("[listSessions-noProject-arg] output:", JSON.stringify(result))
    expect(result).toContain("请先选择项目")
  })

  test("model lists available models when project selected", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    await s.setProject({ project_id: projs[0].id, dir: projs[0].worktree, name: projs[0].name || projs[0].id })
    const result = await h(s).model("user", "ctx")
    console.log("[model] output:", JSON.stringify(result.substring(0, 300)))
    expect(result).toContain("可用模型")
  })

  test("model errors when no project selected", async () => {
    const result = await h().model("user", "ctx")
    console.log("[model-noProject] output:", JSON.stringify(result))
    expect(result).toContain("请先选择项目")
  })

  test("model with arg selects model and sets runtime", async () => {
    const s = freshState()
    const projs = await session.listProjects()
    await s.setProject({ project_id: projs[0].id, dir: projs[0].worktree, name: projs[0].name || projs[0].id })
    const models = await session.listModels()
    const target = models[0]
    const result = await h(s).model("user", "ctx", "1")
    console.log("[model-select] output:", JSON.stringify(result))
    expect(result).toContain("已选择模型")
    expect(result).toContain(target.name)
    const rt = await s.getRuntime()
    console.log("[model-select] runtime:", JSON.stringify(rt))
    expect(rt?.model).toEqual(target.model)
  })
})

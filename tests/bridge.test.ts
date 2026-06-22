import { describe, test, expect } from "bun:test"
import { createRouter } from "../src/bridge"

describe("bridge router", () => {
  const mockHandlers = {
    help: () => "帮助信息",
    status: async () => "状态信息",
    newSession: async () => "新会话已创建",
    projects: async () => "项目列表",
    listSessions: async () => "会话列表",
    selectProject: async (id: string) => `已选择 ${id}`,
    selectSession: async (id: string) => `已选择会话 ${id}`,
  }

  const router = createRouter(mockHandlers as any)

  test("routes commands to matching handler", async () => {
    const result = await router.route("READY", "/help")
    expect(result.text).toBe("帮助信息")
  })

  test("routes unknown command to fallback", async () => {
    const result = await router.route("READY", "/unknown")
    expect(result.text).toContain("未知命令")
  })

  test("routes non-command message to queue in READY state", async () => {
    const result = await router.route("READY", "hello")
    expect(result.action).toBe("enqueue")
    expect(result.text).toBe("hello")
  })

  test("routes message to project select in NO_PROJECT state", async () => {
    const result = await router.route("NO_PROJECT", "hello")
    expect(result.action).toBe("select_project")
  })

  test("routes message to session select in SESSION_SELECT state", async () => {
    const result = await router.route("SESSION_SELECT", "1")
    expect(result.action).toBe("select_session")
  })
})

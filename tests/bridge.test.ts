import { describe, test, expect } from "bun:test"
import { createRouter } from "../src/bridge"

describe("bridge router", () => {
  const mockHandlers = {
    help: () => "帮助信息",
    status: async () => "状态信息",
    newSession: async () => "新会话已创建",
    projects: async (_u: string, _c: string, arg?: string) => arg ? `已选择 ${arg}` : "项目列表",
    listSessions: async (_u: string, _c: string, arg?: string) => arg === "new" ? "新会话已创建" : arg ? `已选择会话 ${arg}` : "会话列表",
    model: async (_u: string, _c: string, arg?: string) => arg ? `已选择模型 ${arg}` : "模型列表",
    abort: async () => "已中止",
  }

  const router = createRouter(mockHandlers as any)

  test("routes commands to matching handler", async () => {
    const result = await router.route("/help")
    expect(result.action).toBe("reply")
    expect(result.text).toBe("帮助信息")
  })

  test("routes command with argument", async () => {
    const result = await router.route("/projects 1")
    expect(result.action).toBe("reply")
    expect(result.text).toBe("已选择 1")
  })

  test("routes command with new subcommand", async () => {
    const result = await router.route("/sessions new")
    expect(result.action).toBe("reply")
    expect(result.text).toBe("新会话已创建")
  })

  test("routes unknown command to fallback", async () => {
    const result = await router.route("/unknown")
    expect(result.text).toContain("未知命令")
  })

  test("routes /model command", async () => {
    const result = await router.route("/model")
    expect(result.action).toBe("reply")
    expect(result.text).toBe("模型列表")
  })

  test("routes /model with arg", async () => {
    const result = await router.route("/model 2")
    expect(result.action).toBe("reply")
    expect(result.text).toBe("已选择模型 2")
  })

  test("routes non-command message to enqueue", async () => {
    const result = await router.route("hello")
    expect(result.action).toBe("enqueue")
    expect(result.text).toBe("hello")
  })

  test("routes /abort command", async () => {
    const result = await router.route("/abort")
    expect(result.action).toBe("reply")
    expect(result.text).toBe("已中止")
  })

  test("handles empty text as reply", async () => {
    const result = await router.route("")
    expect(result.action).toBe("reply")
    expect(result.text).toBe("")
  })
})

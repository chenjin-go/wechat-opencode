interface RouteResult {
  action: "reply" | "enqueue"
  text: string
}

interface Handlers {
  help(userId: string, ctx: string, arg?: string): string | Promise<string>
  status(userId: string, ctx: string, arg?: string): string | Promise<string>
  newSession(userId: string, ctx: string, arg?: string): string | Promise<string>
  projects(userId: string, ctx: string, arg?: string): string | Promise<string>
  listSessions(userId: string, ctx: string, arg?: string): string | Promise<string>
  model(userId: string, ctx: string, arg?: string): string | Promise<string>
  abort(userId: string, ctx: string, arg?: string): string | Promise<string>
}

const COMMAND_MAP: Record<string, keyof Handlers> = {
  help: "help",
  status: "status",
  new: "newSession",
  projects: "projects",
  sessions: "listSessions",
  model: "model",
  abort: "abort",
}

export function createRouter(handlers: Handlers) {
  async function route(
    text: string,
    userId = "",
    ctx = ""
  ): Promise<RouteResult> {
    if (!text) {
      return { action: "reply", text: "" }
    }
    if (!text.startsWith("/")) {
      return { action: "enqueue", text }
    }

    const parts = text.slice(1).split(/\s+/)
    const cmd = parts[0]
    const arg = parts.slice(1).join(" ")
    const handler = COMMAND_MAP[cmd]

    if (handler) {
      const reply = await (handlers[handler] as Function)(userId, ctx, arg || undefined)
      return { action: "reply", text: reply }
    }

    return { action: "reply", text: `未知命令: /${cmd}\n发送 /help 查看可用命令` }
  }

  return { route }
}

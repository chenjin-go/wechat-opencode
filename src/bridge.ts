type BotStatus = "NO_PROJECT" | "SESSION_SELECT" | "READY"

interface RouteResult {
  action: "reply" | "enqueue" | "select_project" | "select_session"
  text: string
}

interface Handlers {
  help(userId: string, ctx: string): string | Promise<string>
  status(userId: string, ctx: string): string | Promise<string>
  newSession(userId: string, ctx: string): string | Promise<string>
  projects(userId: string, ctx: string): string | Promise<string>
  listSessions(userId: string, ctx: string): string | Promise<string>
  selectProject(projectId: string, userId: string, ctx: string): string | Promise<string>
  selectSession(sessionIdOrNew: string, userId: string, ctx: string): string | Promise<string>
}

const COMMAND_MAP: Record<string, keyof Handlers> = {
  help: "help",
  status: "status",
  new: "newSession",
  projects: "projects",
  sessions: "listSessions",
}

export function createRouter(handlers: Handlers) {
  async function route(
    status: BotStatus,
    text: string,
    userId = "",
    ctx = ""
  ): Promise<RouteResult> {
    if (status === "NO_PROJECT") {
      return { action: "select_project", text }
    }
    if (status === "SESSION_SELECT") {
      return { action: "select_session", text }
    }

    if (!text.startsWith("/")) {
      return { action: "enqueue", text }
    }

    const cmd = text.slice(1).split(/\s+/)[0]
    const handler = COMMAND_MAP[cmd]

    if (handler) {
      const reply = await (handlers[handler] as Function)(userId, ctx)
      return { action: "reply", text: reply }
    }

    return { action: "reply", text: `未知命令: /${cmd}\n发送 /help 查看可用命令` }
  }

  return { route }
}

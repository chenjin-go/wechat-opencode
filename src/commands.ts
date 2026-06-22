import type { ProjectEntry } from "./types"

interface Sender {
  sendMessage(toUserId: string, text: string, contextToken: string): Promise<boolean>
  sendAdaptive(toUserId: string, text: string, contextToken: string): Promise<boolean>
}

interface Session {
  listProjects(): Promise<Array<{ id: string; worktree: string; name?: string }>>
  createSession(): Promise<string>
  listSessions(directory: string, limit?: number): Promise<Array<{ id: string; title: string; time: { updated: string } }>>
}

interface State {
  getProject(): Promise<{ project_id: string; dir: string; name: string } | null>
  setProject(data: { project_id: string; dir: string; name: string }): Promise<void>
  getRuntime(): Promise<{ status: string; session_id?: string } | null>
  setRuntime(data: { status: string; session_id?: string }): Promise<void>
}

interface Handlers {
  help(userId: string, ctx: string): string
  status(userId: string, ctx: string): Promise<string>
  newSession(userId: string, ctx: string): Promise<string>
  projects(userId: string, ctx: string): Promise<string>
  listSessions(userId: string, ctx: string): Promise<string>
  selectProject(projectId: string, userId: string, ctx: string): Promise<string>
  selectSession(sessionIdOrNew: string, userId: string, ctx: string): Promise<string>
}

export function createCommandHandlers(deps: {
  sender: Sender
  session: Session
  state: State
}): Handlers {
  const { sender, session, state } = deps

  function help(): string {
    return "可用命令:\n/help - 帮助\n/status - 运行状态\n/new - 新建会话\n/projects - 切换项目\n/sessions - 切换会话\n/abort - 中止当前 AI 任务"
  }

  async function status(): Promise<string> {
    const proj = await state.getProject()
    const rt = await state.getRuntime()
    const lines = [
      `项目: ${proj?.name ?? "未选择"}`,
      `会话: ${rt?.session_id ?? "无"}`,
      `状态: ${rt?.status ?? "初始化中"}`,
    ]
    return lines.join("\n")
  }

  async function newSession(): Promise<string> {
    const proj = await state.getProject()
    if (!proj) return "请先选择项目"
    const id = await session.createSession()
    await state.setRuntime({ status: "READY", session_id: id })
    return `新会话已创建: ${id}`
  }

  async function projects(): Promise<string> {
    const list = await session.listProjects()
    const current = await state.getProject()
    const lines = list.map((p, i) => {
      const mark = p.id === current?.project_id ? " ✓" : ""
      return `${i + 1}. ${p.name || p.id}${mark}`
    })
    return lines.length
      ? `可用项目:\n${lines.join("\n")}\n\n回复项目ID或序号以选择`
      : "暂无可用项目"
  }

  async function listSessions(): Promise<string> {
    const proj = await state.getProject()
    if (!proj) return "请先选择项目"
    const list = await session.listSessions(proj.dir, 5)
    const lines = list.map((s, i) => `${i + 1}. ${s.title} (${s.time.updated.slice(0, 10)})`)
    return lines.length
      ? `项目 ${proj.name} 的会话:\n${lines.join("\n")}\n\n回复序号选择，或发 new 创建新会话`
      : "该项目暂无会话，回复 new 创建新会话"
  }

  return {
    help: () => help(),
    status: () => status(),
    newSession: () => newSession(),
    projects: () => projects(),
    listSessions: () => listSessions(),
    selectProject: async (projectId: string) => {
      const list = await session.listProjects()
      const match = list.find((p) => p.id === projectId || p.name === projectId)
      if (!match) return `未找到项目: ${projectId}`
      await state.setProject({ project_id: match.id, dir: match.worktree, name: match.name || match.id })
      return `已选择项目: ${match.name || match.id}\n请选择会话: 回复 /sessions 查看列表，或发 /new 创建新会话`
    },
    selectSession: async (sessionIdOrNew: string) => {
      if (sessionIdOrNew === "new") {
        return newSession()
      }
      const proj = await state.getProject()
      if (!proj) return "请先选择项目"
      const list = await session.listSessions(proj.dir, 5)
      const idx = parseInt(sessionIdOrNew, 10) - 1
      const sel = list[idx]
      if (!sel) return "无效序号"
      await state.setRuntime({ status: "READY", session_id: sel.id })
      return `已选择会话: ${sel.title}`
    },
  }
}

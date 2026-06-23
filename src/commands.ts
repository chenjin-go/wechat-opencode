import type { ProjectEntry } from "./types"

interface ModelEntry {
  id: string
  model: { providerID: string; modelID: string }
  name: string
}

interface Session {
  listProjects(): Promise<Array<{ id: string; worktree: string; name?: string }>>
  createSession(directory?: string): Promise<string>
  listSessions(limit?: number, projectId?: string): Promise<Array<{ id: string; title: string; time: { updated: string } }>>
  listModels(): Promise<ModelEntry[]>
  abort(sessionId: string): Promise<void>
}

interface State {
  getProject(): Promise<{ project_id: string; dir: string; name: string } | null>
  setProject(data: { project_id: string; dir: string; name: string }): Promise<void>
  getRuntime(): Promise<{ session_id?: string; model?: { providerID: string; modelID: string } } | null>
  setRuntime(data: { session_id?: string; model?: { providerID: string; modelID: string } }): Promise<void>
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

export function createCommandHandlers(deps: {
  session: Session
  state: State
}): Handlers {
  const { session, state } = deps

  function help(): string {
    return "可用命令:\n/help - 帮助\n/status - 运行状态\n/new - 新建会话\n/projects - 切换项目 (/projects <序号> 选择)\n/sessions - 切换会话 (/sessions <序号|new>)\n/model - 切换模型 (/model <序号>)\n/abort - 中止当前 AI 任务"
  }

  async function status(): Promise<string> {
    const proj = await state.getProject()
    const rt = await state.getRuntime()
    const modelStr = rt?.model ? `${rt.model.providerID}/${rt.model.modelID}` : "未选择"
    const lines = [
      `项目: ${proj?.name ?? "未选择"}`,
      `会话: ${rt?.session_id ?? "无"}`,
      `模型: ${modelStr}`,
    ]
    return lines.join("\n")
  }

  async function newSession(): Promise<string> {
    const proj = await state.getProject()
    if (!proj) return "请先选择项目"
    const id = await session.createSession(proj.dir)
    const rt = await state.getRuntime()
    await state.setRuntime({ ...rt, session_id: id })
    return `新会话已创建: ${id}`
  }

  async function projects(_userId: string, _ctx: string, arg?: string): Promise<string> {
    const list = await session.listProjects()

    if (arg) {
      const idx = parseInt(arg, 10)
      const match = !isNaN(idx) && idx >= 1 && idx <= list.length
        ? list[idx - 1]
        : list.find((p) => p.id === arg || p.name === arg)
      if (!match) return `未找到项目: ${arg}`
      await state.setProject({ project_id: match.id, dir: match.worktree, name: match.name || match.id })
      return `已选择项目: ${match.name || match.id}\n请选择会话: /sessions 查看列表，或 /sessions new 创建新会话`
    }

    const current = await state.getProject()
    const lines = list.map((p, i) => {
      const mark = p.id === current?.project_id ? " ✓" : ""
      const path = p.worktree
      const name = p.name || path
      return `${i + 1}. ${name} (${path})${mark}`
    })
    return lines.length
      ? `可用项目:\n${lines.join("\n")}\n\n回复 /projects <序号> 选择`
      : "暂无可用项目"
  }

  async function listSessions(_userId: string, _ctx: string, arg?: string): Promise<string> {
    const proj = await state.getProject()
    if (!proj) return "请先选择项目"

    if (arg === "new") {
      const id = await session.createSession(proj.dir)
      const rt = await state.getRuntime()
      await state.setRuntime({ ...rt, session_id: id })
      return `新会话已创建: ${id}`
    }

    if (arg) {
      const list = await session.listSessions(5, proj.project_id)
      const idx = parseInt(arg, 10) - 1
      const sel = list[idx]
      if (!sel) return "无效序号"
      await state.setRuntime({ session_id: sel.id })
      return `已选择会话: ${sel.title}`
    }

    const list = await session.listSessions(5, proj.project_id)
    const lines = list.map((s, i) => `${i + 1}. ${s.title} (${s.time.updated.slice(0, 10)})`)
    return lines.length
      ? `项目: ${proj.name} (${proj.dir})\n会话:\n${lines.join("\n")}\n\n回复 /sessions <序号> 选择，或 /sessions new 创建新会话`
      : `项目: ${proj.name} (${proj.dir})\n暂无会话，回复 /sessions new 创建新会话`
  }

  async function abortCmd(): Promise<string> {
    const rt = await state.getRuntime()
    if (!rt?.session_id) return "没有正在处理的任务"
    await session.abort(rt.session_id)
    return "已中止当前 AI 任务"
  }

  async function modelHandler(_userId: string, _ctx: string, arg?: string): Promise<string> {
    const proj = await state.getProject()
    if (!proj) return "请先选择项目"

    const list = await session.listModels()

    if (arg) {
      const rt = await state.getRuntime()
      const idx = parseInt(arg, 10) - 1
      const sel = list[idx]
      if (!sel) return "无效序号"
      await state.setRuntime({ ...rt, model: sel.model })
      return `已选择模型: ${sel.name}`
    }

    const rt = await state.getRuntime()
    const lines = list.map((m, i) => {
      const match = rt?.model && m.model.providerID === rt.model.providerID && m.model.modelID === rt.model.modelID
      const mark = match ? " ✓" : ""
      return `${i + 1}. ${m.name}${mark}`
    })
    return lines.length
      ? `可用模型:\n${lines.join("\n")}\n\n回复 /model <序号> 选择`
      : "暂无可用模型"
  }

  return {
    help: () => help(),
    status: () => status(),
    newSession: () => newSession(),
    projects: (u, c, a) => projects(u, c, a),
    listSessions: (u, c, a) => listSessions(u, c, a),
    model: (u, c, a) => modelHandler(u, c, a),
    abort: () => abortCmd(),
  }
}

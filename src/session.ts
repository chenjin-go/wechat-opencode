interface SessionClientOptions {
  baseUrl: string
  fetch?: typeof fetch
}

interface ProjectInfo {
  id: string
  worktree: string
  name?: string
}

interface SessionInfo {
  id: string
  title: string
  time: { updated: string }
}

interface V2Message {
  info: {
    role: string
    parentID?: string
  }
  parts: Array<{
    type: string
    text?: string
  }>
}

export function createSessionClient(opts: SessionClientOptions) {
  const baseUrl = opts.baseUrl
  const f = opts.fetch ?? fetch

  async function json(method: string, path: string, body?: any): Promise<any> {
    const init: RequestInit = { method, headers: {} }
    if (body) {
      init.body = JSON.stringify(body)
      init.headers = { "Content-Type": "application/json" }
    }
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`
    const res = await f(url, init)
    const text = await res.text()
    if (!text) return null
    return JSON.parse(text)
  }

  async function listProjects(): Promise<ProjectInfo[]> {
    return json("GET", "/project")
  }

  async function createSession(): Promise<string> {
    const res = await json("POST", "/session", {})
    return res.id
  }

  async function listSessions(directory: string, limit?: number): Promise<SessionInfo[]> {
    const params = new URLSearchParams({ order: "desc" })
    if (limit) params.set("limit", String(limit))
    const list: any[] = await json("GET", `/session?${params}`) ?? []
    return list.slice(0, limit).map((s: any) => ({
      id: s.id,
      title: s.title,
      time: { updated: s.time?.updated ? String(s.time.updated) : "" },
    }))
  }

  async function prompt(sessionId: string, text: string): Promise<void> {
    await json("POST", `/session/${sessionId}/prompt_async`, {
      parts: [{ type: "text", text }],
    })
  }

  async function wait(sessionId: string): Promise<void> {
    for (let i = 0; i < 120; i++) {
      const statuses: Record<string, { type: string }> = await json("GET", "/session/status") ?? {}
      const st = statuses[sessionId]
      if (!st || st.type === "idle") return
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  async function getMessages(sessionId: string): Promise<V2Message[]> {
    return json("GET", `/session/${sessionId}/message?order=desc&limit=10`) ?? []
  }

  function extractAssistantText(messages: V2Message[]): string | null {
    const assistant = [...messages].reverse().find((m) => m.info?.role === "assistant")
    if (!assistant?.parts) return null
    const texts = assistant.parts.filter((p) => p.type === "text").map((p) => p.text ?? "")
    return texts.length > 0 ? texts.join("") : null
  }

  return {
    listProjects,
    createSession,
    listSessions,
    prompt,
    wait,
    getMessages,
    extractAssistantText,
  }
}

import { createOpencodeClient } from "@opencode-ai/sdk/v2"

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

export interface ModelInfo {
  id: string
  model: { providerID: string; modelID: string }
  name: string
}

export interface V2Message {
  info: { role: string; [key: string]: unknown }
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>
}

export function createSessionClient(baseUrl: string) {
  const client = createOpencodeClient({ baseUrl })

  async function listProjects(): Promise<ProjectInfo[]> {
    const { data } = await client.project.list()
    return data!
  }

  async function getCurrentProject(): Promise<ProjectInfo | null> {
    const { data } = await client.project.current()
    return data ?? null
  }

  async function createSession(directory?: string): Promise<string> {
    const { data } = directory
      ? await client.session.create({ directory })
      : await client.session.create({})
    return data!.id
  }

  async function listSessions(limit?: number, projectId?: string): Promise<SessionInfo[]> {
    const { data } = await client.v2.session.list({ limit: limit ?? 5, project: projectId })
    return data!.data.map((s) => ({
      id: s.id,
      title: s.title,
      time: { updated: String(s.time.updated) },
    }))
  }

  async function listModels(): Promise<ModelInfo[]> {
    const { data } = await client.config.providers()
    const models: ModelInfo[] = []
    for (const p of data!.providers) {
      for (const [, m] of Object.entries(p.models)) {
        models.push({
          id: `${p.id}/${m.id}`,
          model: { providerID: p.id, modelID: m.id },
          name: `${p.name} - ${m.name}`,
        })
      }
    }
    return models
  }

  async function prompt(sessionId: string, text: string, model?: { providerID: string; modelID: string }): Promise<string> {
    const opts: Record<string, unknown> = {
      sessionID: sessionId,
      parts: [{ type: "text", text }],
    }
    if (model) opts.model = model
    const res = await client.session.prompt(opts as any)
    const data = (res as any).data ?? res
    const err = data.info?.error
    if (err) throw err
    return (data.parts ?? [])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .filter(Boolean)
      .join("")
  }

  async function wait(sessionId: string): Promise<void> {
    await client.v2.session.wait({ sessionID: sessionId })
  }

  async function getMessages(sessionId: string): Promise<V2Message[]> {
    const { data } = await client.session.messages({ sessionID: sessionId, limit: 10 })
    return data!
  }

  async function promptAndWait(sessionId: string, text: string, model?: { providerID: string; modelID: string }): Promise<string> {
    return prompt(sessionId, text, model)
  }

  function extractAssistantText(messages: V2Message[]): string | null {
    const assistant = [...messages].reverse().find((m) => m.info.role === "assistant")
    if (!assistant?.parts) return null
    const texts = assistant.parts.filter((p) => p.type === "text").map((p) => p.text ?? "")
    return texts.length > 0 ? texts.join("") : null
  }

  async function abort(sessionId: string): Promise<void> {
    await client.session.abort({ sessionID: sessionId })
  }

  return {
    listProjects,
    getCurrentProject,
    createSession,
    listSessions,
    listModels,
    prompt,
    wait,
    getMessages,
    promptAndWait,
    extractAssistantText,
    abort,
  }
}

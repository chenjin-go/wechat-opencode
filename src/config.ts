import { AppConfig } from "./types"

export async function loadConfig(path: string): Promise<AppConfig> {
  const file = Bun.file(path)
  const raw = JSON.parse(await file.text())
  return {
    opencode: { base_url: raw.opencode.base_url },
    wechat: {
      state_dir: raw.wechat.state_dir,
      poll_interval_ms: raw.wechat.poll_interval_ms,
      max_reply_chars: raw.wechat.max_reply_chars,
    },
    projects: raw.projects?.map((p: any) => ({
      id: p.id,
      name: p.name,
      dir: p.dir,
    })),
  }
}

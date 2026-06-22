export interface OpenCodeConfig {
  base_url: string
}

export interface WeChatConfig {
  state_dir: string
  poll_interval_ms: number
  max_reply_chars: number
}

export interface ProjectEntry {
  id: string
  name: string
  dir: string
}

export interface AppConfig {
  opencode: OpenCodeConfig
  wechat: WeChatConfig
  projects?: ProjectEntry[]
}

export interface AccountState {
  account_id: string
  token: string
  base_url: string
  saved_at: string
}

export interface ProjectState {
  project_id: string
  dir: string
  name: string
}

export interface RuntimeState {
  status: "NO_PROJECT" | "SESSION_SELECT" | "READY"
  session_id?: string
  last_poll_at?: string
  poll_buf?: string
}

export type BotStatus = "NO_LOGIN" | "NO_PROJECT" | "SESSION_SELECT" | "READY"

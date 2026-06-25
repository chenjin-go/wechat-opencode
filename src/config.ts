import { AppConfig } from "./types"

const DEFAULTS: AppConfig = {
  opencode: { base_url: "http://127.0.0.1:4096" },
  wechat: {
    state_dir: ".runtime",
    poll_interval_ms: 35000,
    max_reply_chars: 6000,
  },
}

export function getDefaultConfig(): AppConfig {
  return {
    opencode: { ...DEFAULTS.opencode },
    wechat: { ...DEFAULTS.wechat },
  }
}

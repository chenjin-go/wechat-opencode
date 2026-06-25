import { describe, test, expect } from "bun:test"
import { getDefaultConfig } from "../src/config"

describe("config", () => {
  test("returns default values", () => {
    const cfg = getDefaultConfig()
    expect(cfg.opencode.base_url).toBe("http://127.0.0.1:4096")
    expect(cfg.wechat.state_dir).toBe(".runtime")
    expect(cfg.wechat.poll_interval_ms).toBe(35000)
    expect(cfg.wechat.max_reply_chars).toBe(6000)
  })

  test("returns fresh copy each call", () => {
    const a = getDefaultConfig()
    const b = getDefaultConfig()
    a.opencode.base_url = "http://other:4096"
    expect(b.opencode.base_url).toBe("http://127.0.0.1:4096")
  })
})

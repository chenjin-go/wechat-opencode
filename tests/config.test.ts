import { describe, test, expect } from "bun:test"
import { loadConfig } from "../src/config"

describe("config", () => {
  test("loads valid config file", async () => {
    const cfg = await loadConfig("fixtures/valid-config.json")
    expect(cfg.opencode.base_url).toBe("http://127.0.0.1:4096")
    expect(cfg.wechat.state_dir).toBe(".runtime")
    expect(cfg.wechat.poll_interval_ms).toBe(3000)
    expect(cfg.wechat.max_reply_chars).toBe(6000)
  })

  test("throws on missing file", async () => {
    expect(loadConfig("fixtures/nonexistent.json")).rejects.toThrow()
  })

  test("throws on invalid JSON", async () => {
    expect(loadConfig("fixtures/invalid.json")).rejects.toThrow()
  })
})

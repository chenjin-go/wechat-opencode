import { describe, test, expect, beforeEach } from "bun:test"
import { join } from "path"
import { mkdir, rm } from "fs/promises"
import { StateStore } from "../src/state"

describe("StateStore", () => {
  const tmpDir = "fixtures/tmp-state"

  beforeEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    await mkdir(tmpDir, { recursive: true })
  })

  test("returns null for missing account", async () => {
    const store = new StateStore(tmpDir)
    const acct = await store.getAccount()
    expect(acct).toBeNull()
  })

  test("saves and loads account", async () => {
    const store = new StateStore(tmpDir)
    await store.setAccount({
      account_id: "bot@im.bot",
      token: "tk_xxx",
      base_url: "https://ilinkai.weixin.qq.com",
      saved_at: "2026-06-22T00:00:00",
    })

    const loaded = await store.getAccount()
    expect(loaded).not.toBeNull()
    expect(loaded!.account_id).toBe("bot@im.bot")
    expect(loaded!.token).toBe("tk_xxx")
  })

  test("saves and loads project", async () => {
    const store = new StateStore(tmpDir)
    await store.setProject({
      project_id: "proj_abc",
      dir: "/path/to/project",
      name: "My App",
    })

    const loaded = await store.getProject()
    expect(loaded).not.toBeNull()
    expect(loaded!.project_id).toBe("proj_abc")
    expect(loaded!.name).toBe("My App")
  })

  test("saves and loads runtime", async () => {
    const store = new StateStore(tmpDir)
    await store.setRuntime({
      session_id: "ses_123",
      last_poll_at: "2026-06-22T00:00:00",
      poll_buf: "buf_abc",
    })

    const loaded = await store.getRuntime()
    expect(loaded).not.toBeNull()
    expect(loaded!.session_id).toBe("ses_123")
  })
})

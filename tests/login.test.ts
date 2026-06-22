import { describe, test, expect, mock } from "bun:test"
import { createLoginClient } from "../src/login"

describe("login", () => {
  function mockSeq(responses: any[]) {
    let i = 0
    return mock(() => {
      const r = responses[i++]
      if (!r) throw new Error("unexpected call #" + i)
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
    })
  }

  test("getQrcode returns QR code URL", async () => {
    const fetch = mockSeq([
      { body: { ret: 0, qrcode: "https://ilinkai.weixin.qq.com/ilink/bot/qrcode?key=abc" } },
    ])
    const login = createLoginClient(fetch)

    const url = await login.getQrcode()

    expect(url).toBe("https://ilinkai.weixin.qq.com/ilink/bot/qrcode?key=abc")
  })

  test("waitForLogin polls status and returns session on confirmed", async () => {
    const fetch = mockSeq([
      { body: { ret: 0, qrcode: "qr_abc" } },
      { body: { ret: 0, status: "wait" } },
      { body: { ret: 0, status: "confirmed", bot_token: "tk_1", ilink_bot_id: "bot@im.bot", baseurl: "https://ilinkai.weixin.qq.com" } },
    ])
    const login = createLoginClient(fetch)

    const session = await login.waitForLogin({ pollIntervalMs: 1 })

    expect(session.token).toBe("tk_1")
    expect(session.account_id).toBe("bot@im.bot")
    expect(session.base_url).toBe("https://ilinkai.weixin.qq.com")
  })

  test("waitForLogin throws on expired QR code", async () => {
    const fetch = mockSeq([
      { body: { ret: 0, qrcode: "qr_abc" } },
      { body: { ret: 0, status: "expired" } },
    ])
    const login = createLoginClient(fetch)

    expect(login.waitForLogin({ pollIntervalMs: 1, maxRefreshes: 0 })).rejects.toThrow("二维码已过期")
  })
})

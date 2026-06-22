import { describe, test, expect, mock } from "bun:test"
import { createPoller } from "../src/poller"

describe("poller", () => {
  function okResp(msgs: any[], buf?: string) {
    return new Response(JSON.stringify({ ret: 0, msgs, get_updates_buf: buf ?? "buf_next" }))
  }

  test("poll returns parsed messages", async () => {
    const fetch = mock(() => okResp([
      { msg_id: "m1", from_user_id: "u1", context_token: "c1", item_list: [{ type: 1, text_item: { text: "hi" } }] },
    ]))
    const poller = createPoller("tk_xxx", fetch)

    const result = await poller.poll()

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].text).toBe("hi")
    expect(result.buf).toBe("buf_next")
  })

  test("poll handles empty messages", async () => {
    const fetch = mock(() => okResp([]))
    const poller = createPoller("tk_xxx", fetch)

    const result = await poller.poll()

    expect(result.messages).toHaveLength(0)
  })

  test("poll sends X-WECHAT-UIN header", async () => {
    let captured: any = null
    const fetch = mock((url: string, init?: any) => {
      captured = init
      return okResp([])
    })
    const poller = createPoller("tk_xxx", fetch)

    await poller.poll("buf_abc")

    expect(captured.headers["X-WECHAT-UIN"]).toBeTruthy()
  })

  test("poll sends Authorization header", async () => {
    let captured: any = null
    const fetch = mock((url: string, init?: any) => {
      captured = init
      return okResp([])
    })
    const poller = createPoller("tk_xxx", fetch)

    await poller.poll()

    expect(captured.headers.Authorization).toBe("Bearer tk_xxx")
  })

  test("poll sends get_updates_buf when provided", async () => {
    let capturedBody: any = null
    const fetch = mock((url: string, init?: any) => {
      capturedBody = JSON.parse(init.body)
      return okResp([])
    })
    const poller = createPoller("tk_xxx", fetch)

    await poller.poll("my_buf")

    expect(capturedBody.get_updates_buf).toBe("my_buf")
  })

  test("poll detects token expiry error", async () => {
    const fetch = mock(() => new Response(JSON.stringify({ ret: -14 })))
    const poller = createPoller("tk_xxx", fetch)

    const result = await poller.poll()

    expect(result.error).toBe("SESSION_EXPIRED")
  })

  test("setToken updates token for subsequent polls", async () => {
    let captured: any = null
    const fetch = mock((url: string, init?: any) => {
      captured = init
      return okResp([])
    })
    const poller = createPoller("tk_old", fetch)

    poller.setToken("tk_new")
    await poller.poll()

    expect(captured.headers.Authorization).toBe("Bearer tk_new")
  })

  test("poll detects invalid token error", async () => {
    const fetch = mock(() => new Response(JSON.stringify({ ret: -2 })))
    const poller = createPoller("tk_xxx", fetch)

    const result = await poller.poll()

    expect(result.error).toBe("TOKEN_INVALID")
  })
})

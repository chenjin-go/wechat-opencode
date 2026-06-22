import { describe, test, expect, mock } from "bun:test"
import { createSender } from "../src/sender"

describe("sender", () => {
  function okRes() {
    return new Response(JSON.stringify({ ret: 0 }))
  }

  test("sends text message via iLink API", async () => {
    const send = mock(() => okRes())
    const sender = createSender("tk_xxx", send)

    const result = await sender.sendMessage("user@im.wechat", "hello", "ctx_001")

    expect(result).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)

    const init = send.mock.calls[0][1]
    expect(init.method).toBe("POST")

    const body = JSON.parse(init.body)
    expect(body.msg.to_user_id).toBe("user@im.wechat")
    expect(body.msg.item_list[0].text_item.text).toBe("hello")
    expect(body.msg.context_token).toBe("ctx_001")
  })

  test("adds required headers", async () => {
    const send = mock(() => okRes())
    const sender = createSender("tk_xxx", send)

    await sender.sendMessage("user@im.wechat", "hi", "ctx_002")

    const init = send.mock.calls[0][1]
    expect(init.headers.Authorization).toBe("Bearer tk_xxx")
    expect(init.headers.AuthorizationType).toBe("ilink_bot_token")
    expect(init.headers["Content-Type"]).toBe("application/json")
    expect(init.headers["X-WECHAT-UIN"]).toBeTruthy()
  })

  test("sends adaptive short reply as single message", async () => {
    const send = mock(() => okRes())
    const sender = createSender("tk_xxx", send)

    await sender.sendAdaptive("user@im.wechat", "短回复", "ctx_003")

    expect(send).toHaveBeenCalledTimes(1)
    const init = send.mock.calls[0][1]
    const body = JSON.parse(init.body)
    expect(body.msg.item_list[0].text_item.text).toBe("短回复")
  })

  test("setToken updates token for subsequent requests", async () => {
    const send = mock(() => okRes())
    const sender = createSender("tk_old", send)

    sender.setToken("tk_new")
    await sender.sendMessage("user@im.wechat", "hi", "ctx_005")

    const init = send.mock.calls[0][1]
    expect(init.headers.Authorization).toBe("Bearer tk_new")
  })

  test("splits long reply into appropriately sized chunks", async () => {
    const send = mock(() => okRes())
    const sender = createSender("tk_xxx", send, { maxChars: 20 })

    await sender.sendAdaptive("user@im.wechat", "A".repeat(25), "ctx_004")

    const texts = send.mock.calls.map((c: any) => JSON.parse(c[1].body).msg.item_list[0].text_item.text)

    expect(texts.length).toBeGreaterThan(1)
    for (const t of texts) {
      expect(t.length).toBeLessThanOrEqual(20)
    }
    const contentParts = texts.map(t => t.replace(/\[\d+\/\d+\]\n/, ""))
    expect(contentParts.join("")).toBe("A".repeat(25))
  })
})

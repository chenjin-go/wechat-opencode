interface PollResult {
  messages: Array<{
    msg_id: string
    from_user_id: string
    context_token: string
    text: string
  }>
  buf: string
  error?: "TOKEN_INVALID" | "SESSION_EXPIRED"
}

export function createPoller(initialToken: string, send: typeof fetch = fetch) {
  let token = initialToken

  function setToken(t: string) { token = t }

  function wechatUin(): string {
    const val = Math.floor(Math.random() * 2 ** 32)
    return btoa(String(val))
  }

  async function poll(buf?: string): Promise<PollResult> {
    const body: any = { base_info: { channel_version: "1.0.2" } }
    if (buf) body.get_updates_buf = buf

    const res = await send("https://ilinkai.weixin.qq.com/ilink/bot/getupdates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        AuthorizationType: "ilink_bot_token",
        Authorization: `Bearer ${token}`,
        "X-WECHAT-UIN": wechatUin(),
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (data.ret === -2) return { messages: [], buf: buf ?? "", error: "TOKEN_INVALID" }
    if (data.ret === -14) return { messages: [], buf: buf ?? "", error: "SESSION_EXPIRED" }

    const messages = (data.msgs || []).map((m: any) => {
      const text = m.item_list?.find((i: any) => i.type === 1)?.text_item?.text ?? ""
      return {
        msg_id: m.msg_id,
        from_user_id: m.from_user_id,
        context_token: m.context_token,
        text,
      }
    })

    return { messages, buf: data.get_updates_buf ?? buf ?? "" }
  }

  return { poll, setToken }
}

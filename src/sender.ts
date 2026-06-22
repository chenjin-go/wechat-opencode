import { randomUUID } from "crypto"

interface SenderOptions {
  maxChars?: number
}

export function createSender(
  initialToken: string,
  send: typeof fetch = fetch,
  opts: SenderOptions = {}
) {
  const maxChars = opts.maxChars ?? 6000
  let token = initialToken

  function setToken(t: string) { token = t }

  function wechatUin(): string {
    const val = Math.floor(Math.random() * 2 ** 32)
    return btoa(String(val))
  }

  async function sendMessage(
    toUserId: string,
    text: string,
    contextToken: string
  ): Promise<boolean> {
    const body = JSON.stringify({
      msg: {
        to_user_id: toUserId,
        client_id: randomUUID(),
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [{ type: 1, text_item: { text } }],
      },
      base_info: { channel_version: "1.0.2" },
    })

    const res = await send("https://ilinkai.weixin.qq.com/ilink/bot/sendmessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        AuthorizationType: "ilink_bot_token",
        Authorization: `Bearer ${token}`,
        "X-WECHAT-UIN": wechatUin(),
      },
      body,
    })

    const data = await res.json()
    return data.ret === 0
  }

  async function sendAdaptive(
    toUserId: string,
    text: string,
    contextToken: string
  ): Promise<boolean> {
    if (text.length <= maxChars) {
      return sendMessage(toUserId, text, contextToken)
    }

    const prefixLen = 8
    const contentLen = maxChars - prefixLen
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += contentLen) {
      chunks.push(text.slice(i, i + contentLen))
    }

    let ok = true
    for (let i = 0; i < chunks.length; i++) {
      const msg = `[${i + 1}/${chunks.length}]\n${chunks[i]}`
      ok = await sendMessage(toUserId, msg, contextToken) && ok
    }
    return ok
  }

  return { sendMessage, sendAdaptive, setToken }
}

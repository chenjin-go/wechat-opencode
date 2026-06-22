interface LoginSession {
  token: string
  base_url: string
  account_id: string
}

interface LoginOptions {
  pollIntervalMs?: number
  maxRefreshes?: number
}

export function createLoginClient(send: typeof fetch = fetch) {
  function wechatUin(): string {
    const val = Math.floor(Math.random() * 2 ** 32)
    return btoa(String(val))
  }

  async function json(method: string, path: string): Promise<any> {
    const res = await send(`https://ilinkai.weixin.qq.com${path}`, {
      method,
      headers: {
        "X-WECHAT-UIN": wechatUin(),
      },
    })
    return res.json()
  }

  async function getQrcode(): Promise<string> {
    const data = await json("GET", "/ilink/bot/get_bot_qrcode?bot_type=3")
    return data.qrcode
  }

  async function waitForLogin(opts: LoginOptions = {}): Promise<LoginSession> {
    const pollMs = opts.pollIntervalMs ?? 2000
    const maxRefreshes = opts.maxRefreshes ?? 3

    for (let refresh = 0; refresh <= maxRefreshes; refresh++) {
      const qrcode = await getQrcode()

      for (;;) {
        await sleep(pollMs)
        const status = await json("GET", `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`)

        if (status.status === "confirmed") {
          return {
            token: status.bot_token,
            base_url: status.baseurl || "https://ilinkai.weixin.qq.com",
            account_id: status.ilink_bot_id,
          }
        }
        if (status.status === "expired") break
      }
    }

    throw new Error("二维码已过期")
  }

  return { getQrcode, waitForLogin }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

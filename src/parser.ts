interface WechatItem {
  type: number
  text_item?: { text: string }
  image_item?: { media: string }
  voice_item?: { media: string; text?: string }
  file_item?: { file_name: string; media: string }
  video_item?: { media: string }
}

interface WechatMessage {
  item_list?: WechatItem[]
}

export function parseMessage(msg: WechatMessage): string | null {
  if (!msg.item_list) return null
  for (const item of msg.item_list) {
    if (item.type === 1 && item.text_item?.text) {
      return item.text_item.text
    }
  }
  return null
}

export function isCommand(text: string): boolean {
  return text.startsWith("/")
}

export function extractCommand(text: string): string {
  return text.slice(1)
}

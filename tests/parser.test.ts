import { describe, test, expect } from "bun:test"
import { parseMessage, isCommand, extractCommand } from "../src/parser"

describe("parser", () => {
  describe("parseMessage", () => {
    test("extracts text from type=1 message", () => {
      const msg = {
        item_list: [{ type: 1, text_item: { text: "hello" } }],
      }
      expect(parseMessage(msg)).toBe("hello")
    })

    test("returns null for empty item_list", () => {
      const msg = { item_list: [] }
      expect(parseMessage(msg)).toBeNull()
    })

    test("returns null for missing item_list", () => {
      const msg = {}
      expect(parseMessage(msg)).toBeNull()
    })

    test("returns placeholder for non-text types", () => {
      const msg = {
        item_list: [{ type: 2, image_item: { media: "img.jpg" } }],
      }
      expect(parseMessage(msg)).toBeNull()
    })

    test("extracts first text from multiple items", () => {
      const msg = {
        item_list: [
          { type: 2, image_item: { media: "img.jpg" } },
          { type: 1, text_item: { text: "hello" } },
        ],
      }
      expect(parseMessage(msg)).toBe("hello")
    })
  })

  describe("isCommand", () => {
    test("detects messages starting with /", () => {
      expect(isCommand("/status")).toBe(true)
      expect(isCommand("hello")).toBe(false)
      expect(isCommand("")).toBe(false)
    })
  })

  describe("extractCommand", () => {
    test("extracts command name without leading slash", () => {
      expect(extractCommand("/status")).toBe("status")
      expect(extractCommand("/new")).toBe("new")
    })
  })
})

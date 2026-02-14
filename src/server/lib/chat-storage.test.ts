import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import type { Chat, ChatMessage } from "@/types/chat"

// Mock homedir to use a temp directory
let tempDir: string

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>()
  return {
    ...actual,
    homedir: () => tempDir,
  }
})

let getAllChats: typeof import("./chat-storage").getAllChats
let getChat: typeof import("./chat-storage").getChat
let getChatMessages: typeof import("./chat-storage").getChatMessages
let saveChat: typeof import("./chat-storage").saveChat
let saveChatMessages: typeof import("./chat-storage").saveChatMessages
let deleteChat: typeof import("./chat-storage").deleteChat

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "takopi-test-"))
  vi.resetModules()
  const mod = await import("./chat-storage")
  getAllChats = mod.getAllChats
  getChat = mod.getChat
  getChatMessages = mod.getChatMessages
  saveChat = mod.saveChat
  saveChatMessages = mod.saveChatMessages
  deleteChat = mod.deleteChat
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: "test-1",
    title: "Test Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agent: "agent-1",
    ...overrides,
  }
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "user",
    content: [{ type: "text", text: "Hello" }],
    createdAt: Date.now(),
    agent: "agent-1",
    ...overrides,
  }
}

describe("chat-storage", () => {
  describe("saveChat / getChat", () => {
    it("saves and retrieves a chat", async () => {
      const chat = makeChat()
      await saveChat(chat)

      const retrieved = await getChat("test-1")
      expect(retrieved).toEqual(chat)
    })

    it("returns null for non-existent chat", async () => {
      const result = await getChat("does-not-exist")
      expect(result).toBeNull()
    })
  })

  describe("getAllChats", () => {
    it("returns empty array when no chats exist", async () => {
      const chats = await getAllChats()
      expect(chats).toEqual([])
    })

    it("returns chats sorted by updatedAt descending", async () => {
      const chat1 = makeChat({ id: "c1", updatedAt: 1000 })
      const chat2 = makeChat({ id: "c2", updatedAt: 3000 })
      const chat3 = makeChat({ id: "c3", updatedAt: 2000 })

      await saveChat(chat1)
      await saveChat(chat2)
      await saveChat(chat3)

      const chats = await getAllChats()
      expect(chats.map((c) => c.id)).toEqual(["c2", "c3", "c1"])
    })
  })

  describe("saveChatMessages / getChatMessages", () => {
    it("saves and retrieves messages", async () => {
      const chat = makeChat()
      await saveChat(chat)

      const messages: ChatMessage[] = [
        makeMessage({ id: "m1", role: "user" }),
        makeMessage({
          id: "m2",
          role: "assistant",
          content: [{ type: "text", text: "Hi there!" }],
        }),
      ]

      await saveChatMessages("test-1", messages)
      const retrieved = await getChatMessages("test-1")
      expect(retrieved).toEqual(messages)
    })

    it("returns empty array when no messages exist", async () => {
      const messages = await getChatMessages("no-messages")
      expect(messages).toEqual([])
    })
  })

  describe("deleteChat", () => {
    it("deletes chat and its messages", async () => {
      const chat = makeChat()
      await saveChat(chat)
      await saveChatMessages("test-1", [makeMessage()])

      await deleteChat("test-1")

      expect(await getChat("test-1")).toBeNull()
      expect(await getChatMessages("test-1")).toEqual([])
    })

    it("does not throw when deleting non-existent chat", async () => {
      await expect(deleteChat("nope")).resolves.not.toThrow()
    })
  })
})

import { join } from "node:path"
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import type { Chat, ChatMessage } from "@/types/chat"
import { getTakopiDataDir } from "./paths"

async function ensureDataDir() {
  const dataDir = getTakopiDataDir()
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }
}

function getChatFilePath(chatId: string): string {
  return join(getTakopiDataDir(), `chat_${chatId}.json`)
}

function getMessagesFilePath(chatId: string): string {
  return join(getTakopiDataDir(), `messages_${chatId}.json`)
}

export async function getAllChats() {
  await ensureDataDir()
  const dataDir = getTakopiDataDir()

  try {
    const files = await readdir(dataDir)
    const chatFiles = files.filter((file) => file.startsWith("chat_") && file.endsWith(".json"))

    const chats = await Promise.all(
      chatFiles.map(async (file) => {
        const filePath = join(dataDir, file)
        const content = await readFile(filePath, "utf-8")
        const chat = JSON.parse(content) as Chat

        return chat
      })
    )

    return chats.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (error) {
    console.error("Failed to read chats:", error)
    return []
  }
}

export async function getChat(chatId: string) {
  const chatFilePath = getChatFilePath(chatId)

  if (!existsSync(chatFilePath)) {
    return null
  }

  try {
    const chatContent = await readFile(chatFilePath, "utf-8")
    const chatMetadata = JSON.parse(chatContent) as Chat

    return chatMetadata
  } catch (error) {
    console.error("Failed to read chat:", error)
    return null
  }
}

export async function getChatMessages(chatId: string) {
  const messagesFilePath = getMessagesFilePath(chatId)

  if (existsSync(messagesFilePath)) {
    const messagesContent = await readFile(messagesFilePath, "utf-8")
    return JSON.parse(messagesContent) as ChatMessage[]
  }

  return []
}

export async function saveChat(chat: Chat) {
  await ensureDataDir()

  // Save chat metadata without messages
  const chatFilePath = getChatFilePath(chat.id)

  await writeFile(chatFilePath, JSON.stringify(chat, null, 2), "utf-8")

  return chat
}

export async function saveChatMessages(chatId: string, messages: ChatMessage[]) {
  // Save messages separately
  const messagesFilePath = getMessagesFilePath(chatId)
  await writeFile(messagesFilePath, JSON.stringify(messages, null, 2), "utf-8")
}

export async function deleteChat(chatId: string) {
  const chatFilePath = getChatFilePath(chatId)
  const messagesFilePath = getMessagesFilePath(chatId)

  if (existsSync(chatFilePath)) {
    await unlink(chatFilePath)
  }
  if (existsSync(messagesFilePath)) {
    await unlink(messagesFilePath)
  }
}

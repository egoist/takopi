import { join, resolve } from "node:path"
import { readFile, writeFile, mkdir, readdir, unlink, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import type { Chat, ChatMessage } from "@/types/chat"
import { getTakopiDataDir, getTakopiFilesDir } from "./paths"

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
  await ensureDataDir()
  const previousMessages = await getChatMessages(chatId)
  // Save messages separately
  const messagesFilePath = getMessagesFilePath(chatId)
  await writeFile(messagesFilePath, JSON.stringify(messages, null, 2), "utf-8")

  const previousFilePaths = getReferencedManagedFilePaths(previousMessages)
  const nextFilePaths = getReferencedManagedFilePaths(messages)
  const removedFilePaths = [...previousFilePaths].filter((filePath) => !nextFilePaths.has(filePath))
  if (removedFilePaths.length > 0) {
    await cleanupUnreferencedFiles(removedFilePaths)
  }
}

export async function deleteChat(chatId: string) {
  const messages = await getChatMessages(chatId)
  const referencedFilePaths = [...getReferencedManagedFilePaths(messages)]
  const chatFilePath = getChatFilePath(chatId)
  const messagesFilePath = getMessagesFilePath(chatId)

  if (existsSync(chatFilePath)) {
    await unlink(chatFilePath)
  }
  if (existsSync(messagesFilePath)) {
    await unlink(messagesFilePath)
  }
  if (referencedFilePaths.length > 0) {
    await cleanupUnreferencedFiles(referencedFilePaths)
  }
}

function getReferencedManagedFilePaths(messages: ChatMessage[]): Set<string> {
  const filesDir = resolve(getTakopiFilesDir())
  const referencedPaths = new Set<string>()

  for (const message of messages) {
    const files = message.files ?? []
    for (const part of files) {
      if (part.type !== "file") continue
      const filePath = resolve(part.url)
      if (
        filePath === filesDir ||
        filePath.startsWith(`${filesDir}/`) ||
        filePath.startsWith(`${filesDir}\\`)
      ) {
        referencedPaths.add(filePath)
      }
    }
  }

  return referencedPaths
}

async function isFileReferencedInAnyChat(filePath: string): Promise<boolean> {
  const dataDir = getTakopiDataDir()
  if (!existsSync(dataDir)) return false

  const entries = await readdir(dataDir)
  const messageFiles = entries.filter(
    (entry) => entry.startsWith("messages_") && entry.endsWith(".json")
  )

  for (const messageFile of messageFiles) {
    const fullPath = join(dataDir, messageFile)
    try {
      const content = await readFile(fullPath, "utf-8")
      const messages = JSON.parse(content) as ChatMessage[]
      const referencedPaths = getReferencedManagedFilePaths(messages)
      if (referencedPaths.has(filePath)) {
        return true
      }
    } catch {
      // ignore malformed/partial files; cleanup remains best-effort
    }
  }

  return false
}

async function cleanupUnreferencedFiles(filePaths: string[]) {
  for (const filePath of filePaths) {
    if (await isFileReferencedInAnyChat(filePath)) {
      continue
    }
    await rm(filePath, { force: true })
  }
}

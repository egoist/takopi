import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { getTakopiDataDir } from "./paths"

const TELEGRAM_ACTIVE_CHATS_FILE = "telegram_active_chats.json"

let writeQueue: Promise<void> = Promise.resolve()

type ActiveChatsRecord = Record<string, string>

function getActiveChatsFilePath() {
  return join(getTakopiDataDir(), TELEGRAM_ACTIVE_CHATS_FILE)
}

async function ensureDataDir() {
  const dataDir = getTakopiDataDir()
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }
}

function parseActiveChats(value: unknown): ActiveChatsRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const candidate = value as Record<string, unknown>
  const result: ActiveChatsRecord = {}

  for (const [chatId, chatKey] of Object.entries(candidate)) {
    if (!/^-?\d+$/.test(chatId)) {
      continue
    }
    if (typeof chatKey !== "string" || !chatKey.trim()) {
      continue
    }
    result[chatId] = chatKey
  }

  return result
}

async function readActiveChats(): Promise<ActiveChatsRecord> {
  await ensureDataDir()
  const filePath = getActiveChatsFilePath()
  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const raw = await readFile(filePath, "utf-8")
    return parseActiveChats(JSON.parse(raw))
  } catch {
    return {}
  }
}

async function writeActiveChats(value: ActiveChatsRecord): Promise<void> {
  await ensureDataDir()
  await writeFile(getActiveChatsFilePath(), JSON.stringify(value, null, 2), "utf-8")
}

async function withWriteQueue<T>(operation: () => Promise<T>): Promise<T> {
  const resultPromise = writeQueue.then(operation, operation)
  writeQueue = resultPromise.then(
    () => undefined,
    () => undefined
  )
  return resultPromise
}

export async function getTelegramActiveChatId(telegramChatId: number): Promise<string | null> {
  const chats = await readActiveChats()
  return chats[String(telegramChatId)] ?? null
}

export async function setTelegramActiveChatId(telegramChatId: number, chatId: string): Promise<void> {
  await withWriteQueue(async () => {
    const chats = await readActiveChats()
    chats[String(telegramChatId)] = chatId
    await writeActiveChats(chats)
  })
}

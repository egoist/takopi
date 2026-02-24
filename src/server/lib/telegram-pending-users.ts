import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { TelegramPendingUser } from "@/types/telegram"
import { getTakopiDataDir } from "./paths"

const TELEGRAM_PENDING_USERS_FILE = "telegram_pending_users.json"

let writeQueue: Promise<void> = Promise.resolve()

function getPendingUsersFilePath() {
  return join(getTakopiDataDir(), TELEGRAM_PENDING_USERS_FILE)
}

async function ensureDataDir() {
  const dataDir = getTakopiDataDir()
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }
}

function parsePendingUsers(value: unknown): TelegramPendingUser[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }

    const candidate = item as Record<string, unknown>
    const id = candidate.id
    const requestedAt = candidate.requestedAt
    if (typeof id !== "number" || typeof requestedAt !== "number") {
      return []
    }

    return [
      {
        id,
        requestedAt,
        username: typeof candidate.username === "string" ? candidate.username : undefined,
        firstName: typeof candidate.firstName === "string" ? candidate.firstName : undefined,
        lastName: typeof candidate.lastName === "string" ? candidate.lastName : undefined
      }
    ]
  })
}

async function readPendingUsers(): Promise<TelegramPendingUser[]> {
  await ensureDataDir()
  const filePath = getPendingUsersFilePath()
  if (!existsSync(filePath)) {
    return []
  }

  try {
    const raw = await readFile(filePath, "utf-8")
    return parsePendingUsers(JSON.parse(raw))
  } catch {
    return []
  }
}

async function writePendingUsers(users: TelegramPendingUser[]): Promise<void> {
  await ensureDataDir()
  await writeFile(getPendingUsersFilePath(), JSON.stringify(users, null, 2), "utf-8")
}

async function withWriteQueue<T>(operation: () => Promise<T>): Promise<T> {
  const resultPromise = writeQueue.then(operation, operation)
  writeQueue = resultPromise.then(
    () => undefined,
    () => undefined
  )
  return resultPromise
}

export async function getTelegramPendingUsers(): Promise<TelegramPendingUser[]> {
  const users = await readPendingUsers()
  return users.sort((a, b) => b.requestedAt - a.requestedAt)
}

export async function addTelegramPendingUser(user: TelegramPendingUser): Promise<void> {
  await withWriteQueue(async () => {
    const users = await readPendingUsers()
    if (users.some((existingUser) => existingUser.id === user.id)) {
      return
    }

    await writePendingUsers([...users, user])
  })
}

export async function removeTelegramPendingUser(userId: number): Promise<void> {
  await withWriteQueue(async () => {
    const users = await readPendingUsers()
    const nextUsers = users.filter((user) => user.id !== userId)
    if (nextUsers.length === users.length) {
      return
    }
    await writePendingUsers(nextUsers)
  })
}

export async function removeApprovedUsersFromPending(approvedUserIds: number[]): Promise<void> {
  const approvedSet = new Set(approvedUserIds)
  if (approvedSet.size === 0) {
    return
  }

  await withWriteQueue(async () => {
    const users = await readPendingUsers()
    const nextUsers = users.filter((user) => !approvedSet.has(user.id))
    if (nextUsers.length === users.length) {
      return
    }
    await writePendingUsers(nextUsers)
  })
}

import { base } from "./base"
import { z } from "zod"
import {
  getAllChats,
  getChat as getChatFromStorage,
  saveChat,
  getChatMessages,
  saveChatMessages,
  deleteChat as deleteChatFromStorage
} from "../lib/chat-storage"
import { saveSessionMemory, deleteSessionMemory } from "../lib/memory"
import { openMemoryDB } from "../lib/memory-index"
import { join } from "node:path"
import { readdir, stat, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { exec } from "node:child_process"
import { fdir } from "fdir"
import { fuzzyFilter } from "fuzzbunny"
import { loadSkills } from "../lib/skills"
import { getAgentWorkspaceDir } from "../lib/paths"

export const chatRouter = {
  getChats: base.handler(async () => {
    const chats = await getAllChats()
    return chats
  }),

  getChat: base
    .input(
      z.object({
        chatId: z.string()
      })
    )
    .handler(async ({ input }) => {
      return getChatFromStorage(input.chatId)
    }),

  renameChat: base
    .input(
      z.object({
        chatId: z.string(),
        title: z.string()
      })
    )
    .handler(async ({ input }) => {
      const chat = await getChatFromStorage(input.chatId)
      if (!chat) {
        throw new Error("Chat not found")
      }
      chat.title = input.title
      chat.updatedAt = Date.now()
      await saveChat(chat)
      return chat
    }),

  deleteChat: base
    .input(
      z.object({
        chatId: z.string()
      })
    )
    .handler(async ({ input }) => {
      const chat = await getChatFromStorage(input.chatId)
      await deleteChatFromStorage(input.chatId)

      // Clean up memory files and index for this chat
      if (chat) {
        const workspaceDir = getAgentWorkspaceDir(chat.agent)
        const deletedFiles = await deleteSessionMemory(workspaceDir, input.chatId)
        if (deletedFiles.length > 0) {
          try {
            const db = await openMemoryDB(chat.agent)
            for (const relPath of deletedFiles) {
              await db.execute({ sql: "DELETE FROM memory_chunks WHERE path = ?", args: [relPath] })
              await db.execute({ sql: "DELETE FROM memory_files WHERE path = ?", args: [relPath] })
            }
          } catch {
            // Index cleanup is best-effort
          }
        }
      }
    }),

  getMessages: base
    .input(
      z.object({
        chatId: z.string()
      })
    )
    .handler(({ input }) => {
      return getChatMessages(input.chatId)
    }),

  updateNextMessageId: base
    .input(
      z.object({
        chatId: z.string(),
        messageId: z.string(),
        nextMessageId: z.string()
      })
    )
    .handler(async ({ input }) => {
      const messages = await getChatMessages(input.chatId)
      const message = messages.find((m) => m.id === input.messageId)
      if (!message) {
        throw new Error("Message not found")
      }
      message.nextMessageId = input.nextMessageId
      await saveChatMessages(input.chatId, messages)
    }),

  saveSessionMemory: base
    .input(
      z.object({
        chatId: z.string(),
        agentId: z.string()
      })
    )
    .handler(async ({ input }) => {
      const messages = await getChatMessages(input.chatId)
      if (messages.length === 0) return

      const workspaceDir = getAgentWorkspaceDir(input.agentId)
      await saveSessionMemory(workspaceDir, input.chatId, input.agentId, messages)
    }),

  searchWorkspaceFiles: base
    .input(
      z.object({
        agentId: z.string(),
        query: z.string().optional()
      })
    )
    .handler(async ({ input }) => {
      const workspaceDir = getAgentWorkspaceDir(input.agentId)

      if (!existsSync(workspaceDir)) {
        return []
      }

      const ignoredDirs = [
        "node_modules",
        ".git",
        ".next",
        ".turbo",
        "dist",
        ".cache",
        "__pycache__"
      ]

      try {
        const files = await new fdir()
          .withRelativePaths()
          .exclude((dirName) => ignoredDirs.includes(dirName))
          .crawl(workspaceDir)
          .withPromise()

        const items = files.map((p) => ({
          name: p.split("/").pop()!,
          path: p
        }))

        if (input.query) {
          return fuzzyFilter(items, input.query, { fields: ["path"] }).map((r) => r.item)
        }

        return items
      } catch {
        return []
      }
    }),

  getWorkspaceFiles: base
    .input(
      z.object({
        agentId: z.string(),
        path: z.string().optional()
      })
    )
    .handler(async ({ input }) => {
      const workspaceDir = getAgentWorkspaceDir(input.agentId)
      const targetDir = input.path ? join(workspaceDir, input.path) : workspaceDir

      // Prevent path traversal
      if (!targetDir.startsWith(workspaceDir)) {
        return []
      }

      if (!existsSync(targetDir)) {
        return []
      }

      try {
        const entries = await readdir(targetDir, { withFileTypes: true })

        const HIDDEN_FILES = new Set([".DS_Store", "Thumbs.db"])
        const files = await Promise.all(
          entries.filter((entry) => !HIDDEN_FILES.has(entry.name)).map(async (entry) => {
            const fullPath = join(targetDir, entry.name)
            const stats = await stat(fullPath)
            const relativePath = input.path ? join(input.path, entry.name) : entry.name

            return {
              name: entry.name,
              path: relativePath,
              isDirectory: entry.isDirectory(),
              size: stats.size,
              modifiedAt: stats.mtime.toISOString()
            }
          })
        )

        return files.sort((a, b) => {
          // Directories first, then alphabetically
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
      } catch (error) {
        console.error("Failed to read workspace directory:", error)
        return []
      }
    }),

  readWorkspaceFile: base
    .input(
      z.object({
        agentId: z.string(),
        path: z.string()
      })
    )
    .handler(async ({ input }) => {
      const workspaceDir = getAgentWorkspaceDir(input.agentId)
      const fullPath = join(workspaceDir, input.path)

      // Prevent path traversal
      if (!fullPath.startsWith(workspaceDir)) {
        throw new Error("Invalid path")
      }

      if (!existsSync(fullPath)) {
        throw new Error("File not found")
      }

      const content = await readFile(fullPath, "utf-8")
      return { content }
    }),

  listSkills: base
    .input(
      z.object({
        query: z.string().optional()
      })
    )
    .handler(async ({ input }) => {
      const skills = await loadSkills()
      const items = skills.map((s) => ({ name: s.name, description: s.description }))

      if (input.query) {
        return fuzzyFilter(items, input.query, { fields: ["name"] }).map((r) => r.item)
      }

      return items
    }),

  revealWorkspaceFile: base
    .input(
      z.object({
        agentId: z.string(),
        path: z.string()
      })
    )
    .handler(async ({ input }) => {
      const workspaceDir = getAgentWorkspaceDir(input.agentId)
      const fullPath = join(workspaceDir, input.path)

      // Prevent path traversal
      if (!fullPath.startsWith(workspaceDir)) {
        throw new Error("Invalid path")
      }

      if (!existsSync(fullPath)) {
        throw new Error("File not found")
      }

      const platform = process.platform
      if (platform === "darwin") {
        exec(`open -R "${fullPath}"`)
      } else if (platform === "win32") {
        exec(`explorer /select,"${fullPath}"`)
      } else {
        exec(`xdg-open "${join(fullPath, "..")}"`)
      }
    })
}

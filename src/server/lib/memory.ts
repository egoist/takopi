import fs from "node:fs/promises"
import path from "node:path"
import dayjs from "dayjs"
import type { ChatMessage } from "@/types/chat"
import { getDisplayedMessages } from "@/lib/chat"

const MAX_FILE_CHARS = 20_000
const HEAD_RATIO = 0.7
const TAIL_RATIO = 0.2

function truncateContent(content: string, fileName: string): string {
  const trimmed = content.trimEnd()
  if (trimmed.length <= MAX_FILE_CHARS) {
    return trimmed
  }

  const headChars = Math.floor(MAX_FILE_CHARS * HEAD_RATIO)
  const tailChars = Math.floor(MAX_FILE_CHARS * TAIL_RATIO)
  const head = trimmed.slice(0, headChars)
  const tail = trimmed.slice(-tailChars)

  return [
    head,
    `\n[...truncated ${fileName}: kept ${headChars}+${tailChars} chars of ${trimmed.length}...]\n`,
    tail
  ].join("")
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

export type MemoryContext = {
  files: Array<{ name: string; content: string }>
}

/**
 * Load memory context from the agent's workspace directory.
 * Reads MEMORY.md (or memory.md) and today's + yesterday's daily notes.
 */
export async function loadMemoryContext(workspaceDir: string): Promise<MemoryContext> {
  const files: MemoryContext["files"] = []

  // Load MEMORY.md
  for (const name of ["MEMORY.md"]) {
    const content = await readFileIfExists(path.join(workspaceDir, name))
    if (content !== null) {
      files.push({ name, content: truncateContent(content, name) })
      break // only load one
    }
  }

  // Load today's and yesterday's daily notes
  const today = dayjs()
  const dates = [today, today.subtract(1, "day")]
  for (const date of dates) {
    const name = `memory/${date.format("YYYY-MM-DD")}.md`
    const content = await readFileIfExists(path.join(workspaceDir, name))
    if (content !== null) {
      files.push({ name, content: truncateContent(content, name) })
    }
  }

  return { files }
}

export type WorkspaceFiles = {
  files: Array<{ name: string; content: string }>
}

const WORKSPACE_FILES = ["SOUL.md", "IDENTITY.md", "USER.md"] as const

/**
 * Load workspace context files (SOUL.md, IDENTITY.md, USER.md) from the agent's workspace directory.
 * All files are optional — only returns files that exist.
 */
export async function saveSessionMemory(
  workspaceDir: string,
  chatId: string,
  agentId: string,
  messages: ChatMessage[]
): Promise<void> {
  if (messages.length === 0) return

  const { displayedMessages } = getDisplayedMessages(messages)
  const lines: string[] = []

  for (const msg of displayedMessages) {
    if (msg.role !== "user" && msg.role !== "assistant") continue
    const text = msg.content
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("")
      .trim()
    if (text) {
      lines.push(`${msg.role}: ${text}`)
    }
  }

  if (lines.length === 0) return

  const now = new Date()
  const dateStr = now.toISOString().split("T")[0]
  const timeStr = now.toISOString().split("T")[1].split(".")[0]
  const hhmm = timeStr.replace(/:/g, "").slice(0, 4)

  const memoryDir = path.join(workspaceDir, "memory")
  await fs.mkdir(memoryDir, { recursive: true })

  const filename = `${dateStr}-${hhmm}.md`
  const content = [
    `# Session: ${dateStr} ${timeStr} UTC`,
    "",
    `- **Chat ID**: ${chatId}`,
    `- **Agent ID**: ${agentId}`,
    "",
    "## Conversation Summary",
    "",
    ...lines,
    ""
  ].join("\n")

  await fs.writeFile(path.join(memoryDir, filename), content, "utf-8")
}

export async function deleteSessionMemory(workspaceDir: string, chatId: string): Promise<string[]> {
  const memoryDir = path.join(workspaceDir, "memory")
  const deleted: string[] = []
  const needle = `- **Chat ID**: ${chatId}`
  try {
    const entries = await fs.readdir(memoryDir)
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue
      const filePath = path.join(memoryDir, entry)
      // Chat ID is in the header, only read first 256 bytes
      const fh = await fs.open(filePath, "r")
      const buf = Buffer.alloc(256)
      await fh.read(buf, 0, 256, 0)
      await fh.close()
      if (buf.toString("utf-8").includes(needle)) {
        await fs.unlink(filePath)
        deleted.push(`memory/${entry}`)
      }
    }
  } catch {
    // memory dir might not exist
  }
  return deleted
}

export async function loadWorkspaceFiles(workspaceDir: string): Promise<WorkspaceFiles> {
  const files: WorkspaceFiles["files"] = []

  for (const name of WORKSPACE_FILES) {
    const content = await readFileIfExists(path.join(workspaceDir, name))
    if (content !== null) {
      files.push({ name, content: truncateContent(content, name) })
    }
  }

  return { files }
}

import os from "node:os"
import { readFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { convertToModelMessages } from "ai"
import type { SystemModelMessage, UserModelMessage } from "ai"
import dayjs from "dayjs"
import {
  formatSkillsAsXML,
  getSkillsMetadata,
  getSkillsUsageInstructions,
  loadSkills,
  findSkill,
  formatActivatedSkills
} from "./skills"
import { loadMemoryContext, loadWorkspaceFiles } from "./memory"
import type { ChatMessage } from "@/types/chat"
import type { ChatMessageFile } from "@/types/chat"
import type { ModelConfig } from "@/types/config"
import { getAgentWorkspaceDir, getTakopiFilesDir } from "./paths"

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)
}

function getAttachmentFilePath(value: string): string | null {
  if (value.startsWith("file://")) {
    try {
      return fileURLToPath(value)
    } catch {
      return null
    }
  }
  if (isAbsolutePath(value)) {
    return value
  }
  return null
}

async function resolveFileAttachmentForModel(
  part: ChatMessageFile,
  allowedAttachmentsDir: string
) {
  const filePath = getAttachmentFilePath(part.url)
  if (!filePath) {
    return part
  }

  const resolvedPath = resolve(filePath)
  if (
    resolvedPath !== allowedAttachmentsDir &&
    !resolvedPath.startsWith(`${allowedAttachmentsDir}/`) &&
    !resolvedPath.startsWith(`${allowedAttachmentsDir}\\`)
  ) {
    // Ignore unsafe absolute paths supplied by clients.
    return null
  }

  try {
    const fileContent = await readFile(resolvedPath)
    const mediaType = part.mediaType || "application/octet-stream"
    return {
      ...part,
      filename: part.filename || basename(resolvedPath),
      // Keep persisted messages path-based; only convert right before model invocation.
      url: `data:${mediaType};base64,${fileContent.toString("base64")}`
    }
  } catch {
    return null
  }
}

export async function processMessages(
  messages: ChatMessage[],
  {
    workingDirectory,
    model,
    agentId
  }: {
    workingDirectory: string
    model: ModelConfig
    agentId: string
  }
) {
  const allowedAttachmentsDir = resolve(getTakopiFilesDir())
  const resolvedMessages = await Promise.all(
    messages.map(async (message) => {
      const parts = await Promise.all(
        (message.files ?? []).map(async (part) => {
          return resolveFileAttachmentForModel(part, allowedAttachmentsDir)
        })
      )
      const content = message.content.filter((part) => part.type !== "file")
      const files = parts.filter((part) => part !== null)
      return {
        ...message,
        content,
        files
      }
    })
  )

  const modelMessages = await convertToModelMessages(
    resolvedMessages.map((message) => ({
      role: message.role,
      parts: [...message.content, ...(message.files || [])]
    }))
  )

  const skills = await loadSkills()
  const skillsMetadata = getSkillsMetadata(skills)
  const skillsInstructions = skills.length > 0 ? getSkillsUsageInstructions() : ""
  const skillsXML = formatSkillsAsXML(skillsMetadata)

  const currentDate = dayjs().format("YYYY-MM-DDZ")

  // Load workspace context
  const workspaceDir = getAgentWorkspaceDir(agentId)
  const [memoryContext, workspaceFiles] = await Promise.all([
    loadMemoryContext(workspaceDir),
    loadWorkspaceFiles(workspaceDir)
  ])

  const todayStr = dayjs().format("YYYY-MM-DD")

  const memoryInstructions = `
## Memory & Workspace

<workspace_dir>${workspaceDir}</workspace_dir>

You wake up fresh each session. These files are your continuity:

- **Daily notes:** \`memory/${todayStr}.md\` — raw logs of what happened
- **Long-term:** \`MEMORY.md\` — your curated memories
- **Soul:** \`SOUL.md\` — your personality and behavioral guidelines
- **Identity:** \`IDENTITY.md\` — your name, creature, vibe, emoji
- **User:** \`USER.md\` — info about the user, their name, how to address them, timezone, notes, preferences

### Writing Files

If you want to remember something, WRITE IT TO A FILE. "Mental notes" don't survive session restarts. Files do.

- When someone says "remember this" → update \`memory/${todayStr}.md\`
- For long-term facts, decisions, preferences → update \`MEMORY.md\`
- Read existing files before updating them
- Over time, review daily files and update MEMORY.md with what's worth keeping
- As you learn about the user, update \`USER.md\`
- If you evolve your personality or identity, update \`SOUL.md\` or \`IDENTITY.md\` (tell the user first)
  `.trim()

  // Build workspace context section (SOUL.md, IDENTITY.md, USER.md + memory files)
  const allContextFiles = [...workspaceFiles.files, ...memoryContext.files]
  const hasSoulFile = workspaceFiles.files.some((f) => f.name.toLowerCase() === "soul.md")

  let workspaceContext_section = ""
  if (allContextFiles.length > 0) {
    const contextParts = allContextFiles.map((file) => `## ${file.name}\n\n${file.content}`)
    workspaceContext_section = `
# Workspace Context

The following workspace files have been loaded:
${hasSoulFile ? "If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.\n" : ""}
${contextParts.join("\n\n")}
    `.trim()
  }

  const systemMessages: SystemModelMessage[] = [
    {
      role: "system" as const,
      content: `You're a helpful assistant.`
    },
    skillsInstructions
      ? {
          role: "system" as const,
          content: skillsInstructions
        }
      : null,
    {
      role: "system" as const,
      content: `
# Environment

You have been invoked in the following environment:

- Primary working directory: ${workingDirectory}
- Platform: ${os.platform()}
- OS Version: ${os.version()}
- The current date is: ${currentDate}
- Assistant knowledge cutoff date is ${model.knowledge || "unknown"}
      `.trim()
    },
    {
      role: "system" as const,
      content: memoryInstructions
    },
    workspaceContext_section
      ? {
          role: "system" as const,
          content: workspaceContext_section
        }
      : null
  ].filter((v) => v !== null)

  // Detect /skillname references across all messages and preload matched skills
  const preloadedSkillNames = new Set<string>()
  for (const msg of messages) {
    const text = msg.content
      .filter((part): part is Extract<(typeof msg.content)[number], { type: "text" }> => {
        return part.type === "text"
      })
      .map((part) => part.text)
      .join("")
    const slashMatches = text.match(/(^|\s)\/(\w[\w-]*)/g)
    if (slashMatches) {
      for (const match of slashMatches) {
        const skillName = match.trim().slice(1)
        const skill = findSkill(skills, skillName)
        if (skill && !preloadedSkillNames.has(skillName)) {
          preloadedSkillNames.add(skillName)
        }
      }
    }
  }

  const activatedSkillsContent = formatActivatedSkills(preloadedSkillNames, skills)

  const prependModelMessages: UserModelMessage[] = [
    skillsXML ? { role: "user" as const, content: skillsXML } : null,
    activatedSkillsContent ? { role: "user" as const, content: activatedSkillsContent } : null
  ].filter((v) => v !== null)

  return {
    systemMessages,
    modelMessages: [...prependModelMessages, ...modelMessages],
    skills
  }
}

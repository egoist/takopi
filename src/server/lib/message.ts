import os from "node:os"
import type { ModelMessage, SystemModelMessage, UserModelMessage } from "ai"
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
import type { ModelConfig } from "@/types/config"
import { getAgentWorkspaceDir } from "./paths"

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
  const modelMessages: ModelMessage[] = messages.map((msg) => {
    const textContent =
      msg.content
        ?.filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("") || ""

    return {
      role: msg.role,
      content: textContent
    }
  })

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
    const text =
      msg.content
        ?.filter((part) => part.type === "text")
        .map((part) => (part as { type: "text"; text: string }).text)
        .join("") || ""
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

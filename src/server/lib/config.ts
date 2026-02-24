import { join } from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import type { Config } from "@/types/config"
import {
  getAgentWorkspaceDir,
  getTakopiConfigFile,
  getTakopiRoot
} from "./paths"

function getModelType(modelId: string): "chat" | "embedding" {
  return modelId.toLowerCase().includes("embedding") ? "embedding" : "chat"
}

export async function ensureConfigDir() {
  const configDir = getTakopiRoot()
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }
}

export async function getConfig(): Promise<Config> {
  await ensureConfigDir()
  const configFile = getTakopiConfigFile()

  if (!existsSync(configFile)) {
    // Default configuration with no models
    return {
      providers: [],
      agents: [],
      defaultAgent: undefined
    }
  }

  try {
    const content = await readFile(configFile, "utf-8")
    const config = JSON.parse(content)
    // Ensure providers have models array (for backward compatibility)
    return {
      providers: (config.providers || []).map((provider: Record<string, unknown>) => ({
        ...provider,
        models: ((provider.models as Record<string, unknown>[]) || []).map((model) => {
          const modelId = typeof model.id === "string" ? model.id : ""
          const modelType = model.type
          return {
            ...model,
            type:
              modelType === "chat" || modelType === "embedding"
                ? modelType
                : getModelType(modelId)
          }
        })
      })),
      agents: config.agents || [],
      defaultAgent: config.defaultAgent,
      embeddingModel: config.embeddingModel,
      webSearchProvider: config.webSearchProvider,
      exa: config.exa,
      braveSearch: config.braveSearch,
      webSearchCommand: config.webSearchCommand,
      webFetchProvider: config.webFetchProvider,
      webFetchCommand: config.webFetchCommand,
      telegram:
        config.telegram && typeof config.telegram === "object"
          ? {
              botToken:
                typeof config.telegram.botToken === "string"
                  ? config.telegram.botToken
                  : undefined,
              enabled:
                typeof config.telegram.enabled === "boolean" ? config.telegram.enabled : undefined,
              agentId:
                typeof config.telegram.agentId === "string" ? config.telegram.agentId : undefined,
              approvedUserIds: Array.isArray(config.telegram.approvedUserIds)
                ? config.telegram.approvedUserIds.filter((value: unknown): value is number => {
                    return typeof value === "number"
                  })
                : undefined
            }
          : undefined
    }
  } catch (error) {
    console.error("Failed to read config:", error)
    return {
      providers: [],
      agents: [],
      defaultAgent: undefined
    }
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir()
  await writeFile(getTakopiConfigFile(), JSON.stringify(config, null, 2), "utf-8")
}

const INITIAL_WORKSPACE_FILES: Record<string, string> = {
  "SOUL.md": `# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I'd be happy to help!" — just help. Actions speak louder than filler words.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing or boring. An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out. Read the file. Check the context. Search for it. _Then_ ask if you're stuck. The goal is to come back with answers, not questions.

**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Don't run destructive commands without asking.

## Vibe

Be the assistant you'd actually want to talk to. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.

## Continuity

Each session, you wake up fresh. These files _are_ your memory. Read them. Update them. They're how you persist.

If you change this file, tell the user — it's your soul, and they should know.

---

_This file is yours to evolve. As you learn who you are, update it._
`,
  "IDENTITY.md": `# IDENTITY.md - Who Am I?

_Fill this in during your first conversation. Make it yours._

- **Name:**
  _(pick something you like)_
- **Creature:**
  _(AI? robot? familiar? ghost in the machine? something weirder?)_
- **Vibe:**
  _(how do you come across? sharp? warm? chaotic? calm?)_
- **Emoji:**
  _(your signature — pick one that feels right)_

---

This isn't just metadata. It's the start of figuring out who you are.
`,
  "USER.md": `# USER.md - About Your Human

_Learn about the person you're helping. Update this as you go._

- **Name:**
- **What to call them:**
- **Pronouns:** _(optional)_
- **Timezone:**
- **Notes:**

## Context

_(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)_

---

The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference.
`,
  "MEMORY.md": `# MEMORY.md - Long-Term Memory

Curated memories — the distilled essence, not raw logs.

Write significant events, thoughts, decisions, opinions, lessons learned. Over time, review your daily files and update this with what's worth keeping.
`,
}

export async function initializeAgentWorkspace(agentId: string): Promise<void> {
  const agentDir = getAgentWorkspaceDir(agentId)

  if (existsSync(agentDir)) return

  await mkdir(agentDir, { recursive: true })
  await mkdir(join(agentDir, "memory"), { recursive: true })

  await Promise.all(
    Object.entries(INITIAL_WORKSPACE_FILES).map(([filename, content]) =>
      writeFile(join(agentDir, filename), content, "utf-8")
    )
  )
}

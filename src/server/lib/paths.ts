import { homedir } from "node:os"
import { join } from "node:path"

const DEFAULT_TAKOPI_DIR = ".takopi"

function resolveHomePath(pathValue: string): string {
  if (pathValue === "~") {
    return homedir()
  }
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2))
  }
  return pathValue
}

export function getTakopiRoot(): string {
  const envRoot = process.env.TAKOPI_ROOT?.trim()
  if (!envRoot) {
    return join(homedir(), DEFAULT_TAKOPI_DIR)
  }
  return resolveHomePath(envRoot)
}

export function getTakopiPath(...parts: string[]): string {
  return join(getTakopiRoot(), ...parts)
}

export function getTakopiConfigFile(): string {
  return getTakopiPath("config.json")
}

export function getTakopiAgentsDir(): string {
  return getTakopiPath("agents")
}

export function getAgentWorkspaceDir(agentId: string): string {
  return getTakopiPath("agents", agentId)
}

export function getTakopiDataDir(): string {
  return getTakopiPath("data")
}

export function getTakopiFilesDir(): string {
  return getTakopiPath("files")
}

export function getTakopiSkillsDir(): string {
  return getTakopiPath("skills")
}

export function getClaudeSkillsDir(): string {
  return join(homedir(), ".claude", "skills")
}

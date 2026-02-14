import { join } from "node:path"
import { readdir, readFile, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tool } from "ai"
import z from "zod"
import { parse as parseYaml } from "yaml"
import { getClaudeSkillsDir, getTakopiSkillsDir } from "./paths"

export interface Skill {
  name: string
  description: string
  path: string
  content: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
}

export interface SkillMetadata {
  name: string
  description: string
  path: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns parsed frontmatter and remaining content
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)

  if (!frontmatterMatch) {
    return { frontmatter: {}, body: content }
  }

  const yamlContent = frontmatterMatch[1]
  const body = frontmatterMatch[2]

  try {
    const frontmatter = parseYaml(yamlContent) as Record<string, unknown>
    return { frontmatter: frontmatter || {}, body }
  } catch (error) {
    console.error("Error parsing YAML frontmatter:", error)
    return { frontmatter: {}, body: content }
  }
}

/**
 * Load a single skill from a directory
 */
async function loadSkill(skillPath: string): Promise<Skill | null> {
  const skillMdPath = join(skillPath, "SKILL.md")

  try {
    const stats = await stat(skillMdPath)
    if (!stats.isFile()) return null

    const content = await readFile(skillMdPath, "utf-8")
    const { frontmatter, body } = parseFrontmatter(content)

    // Validate required fields
    if (!frontmatter.name || !frontmatter.description) {
      console.warn(`Skill at ${skillPath} missing required frontmatter fields`)
      return null
    }

    return {
      name: String(frontmatter.name),
      description: String(frontmatter.description),
      path: skillPath,
      content: body,
      license: frontmatter.license ? String(frontmatter.license) : undefined,
      compatibility: frontmatter.compatibility ? String(frontmatter.compatibility) : undefined,
      metadata: frontmatter.metadata as Record<string, string> | undefined
    }
  } catch (error) {
    // SKILL.md doesn't exist or other error
    return null
  }
}

/**
 * Load all skills from a single directory
 */
async function loadSkillsFromDir(dir: string): Promise<Skill[]> {
  if (!existsSync(dir)) {
    return []
  }

  try {
    const entries = await readdir(dir)
    const skills: Skill[] = []

    for (const entry of entries) {
      const skillPath = join(dir, entry)
      const stats = await stat(skillPath)

      if (stats.isDirectory()) {
        const skill = await loadSkill(skillPath)
        if (skill) {
          skills.push(skill)
        }
      }
    }

    return skills
  } catch (error) {
    console.error(`Error loading skills from ${dir}:`, error)
    return []
  }
}

/**
 * Load all skills from both ~/.claude/skills and ~/.takopi/skills.
 * Skills in ~/.takopi/skills take priority over ~/.claude/skills when names collide.
 */
export async function loadSkills(): Promise<Skill[]> {
  const takopiSkillsDir = getTakopiSkillsDir()
  const claudeSkillsDir = getClaudeSkillsDir()
  const [claudeSkills, takopiSkills] = await Promise.all([
    loadSkillsFromDir(claudeSkillsDir),
    loadSkillsFromDir(takopiSkillsDir)
  ])

  // takopi skills override claude skills by name
  const skillsByName = new Map<string, Skill>()
  for (const skill of claudeSkills) {
    skillsByName.set(skill.name, skill)
  }
  for (const skill of takopiSkills) {
    skillsByName.set(skill.name, skill)
  }

  return [...skillsByName.values()]
}

/**
 * Get skill metadata for prompt injection
 */
export function getSkillsMetadata(skills: Skill[]): SkillMetadata[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    path: skill.path,
    license: skill.license,
    compatibility: skill.compatibility,
    metadata: skill.metadata
  }))
}

/**
 * Format skills metadata as XML for system prompt
 */
export function formatSkillsAsXML(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return ""
  }

  const skillsXML = skills
    .map((skill) => {
      let xml = `  <skill>\n    <name>${escapeXml(skill.name)}</name>\n    <description>${escapeXml(skill.description)}</description>`
      xml += `\n    <location>${escapeXml(join(skill.path, "SKILL.md"))}</location>`
      if (skill.license) {
        xml += `\n    <license>${escapeXml(skill.license)}</license>`
      }
      if (skill.compatibility) {
        xml += `\n    <compatibility>${escapeXml(skill.compatibility)}</compatibility>`
      }
      xml += "\n  </skill>"
      return xml
    })
    .join("\n")

  return `<available_skills>\n${skillsXML}\n</available_skills>`
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * Find a skill by name
 */
export function findSkill(skills: Skill[], name: string): Skill | undefined {
  return skills.find((skill) => skill.name === name)
}

/**
 * Read a skill file
 */
export async function readSkillFile(skillPath: string, filePath: string): Promise<string | null> {
  try {
    const fullPath = join(skillPath, filePath)
    const content = await readFile(fullPath, "utf-8")
    return content
  } catch (error) {
    return null
  }
}

/**
 * Create skill-related AI tools
 */
export function createSkillTools(skills: Skill[]) {
  return {
    ReadSkill: tool({
      description:
        "Read the full content of a skill to activate it. Use when you need to use a specific skill.",
      inputSchema: z.object({
        name: z.string().describe("The name of the skill to read")
      }),
      execute: async ({ name }) => {
        const skill = findSkill(skills, name)
        if (!skill) {
          return {
            error: `Skill '${name}' not found. Available skills: ${skills.map((s) => s.name).join(", ")}`
          }
        }

        return {
          content: skill.content
        }
      }
    })
  }
}

/**
 * Get the directories where skills are loaded from
 */
export function getSkillsDirectories(): string[] {
  return [getTakopiSkillsDir(), getClaudeSkillsDir()]
}

/**
 * List all available skill names
 */
export function getSkillNames(skills: Skill[]): string[] {
  return skills.map((skill) => skill.name)
}

/**
 * Check if any skills directory exists
 */
export function skillsDirectoryExists(): boolean {
  return existsSync(getTakopiSkillsDir()) || existsSync(getClaudeSkillsDir())
}

/**
 * Get skills count
 */
export function getSkillsCount(skills: Skill[]): number {
  return skills.length
}

/**
 * Format activated skills as XML content
 */
export function formatActivatedSkills(preloadedSkillNames: Set<string> | string[], skills: Skill[]): string {
  const isEmpty = preloadedSkillNames instanceof Set
    ? preloadedSkillNames.size === 0
    : preloadedSkillNames.length === 0

  if (isEmpty) {
    return ""
  }

  const skillsXML = [...preloadedSkillNames]
    .map((name) => {
      const skill = findSkill(skills, name)!
      return `  <skill>\n    <name>${escapeXml(skill.name)}</name>\n    <location>${escapeXml(join(skill.path, "SKILL.md"))}</location>\n    <content>\n${skill.content}\n    </content>\n  </skill>`
    })
    .join("\n")

  return `<activated_skills>\n${skillsXML}\n</activated_skills>`
}

/**
 * Get instructions for the model about how to use skills
 */
export function getSkillsUsageInstructions(): string {
  return `You have access to agent skills that provide specialized capabilities.

Available skills are listed in <available_skills> in your system prompt. Each skill has a name, description, and location.

To use a skill:
1. First, read the SKILL.md for that skill using the Read tool
2. The skill content will contain instructions on how to use it
3. Skills may have additional files in scripts/, references/, or assets/ directories that you can read with Read tool
4. Use the Bash tool to run any commands or scripts the skill requires

The user can also activate skills by typing /skillname in their message. When a skill is activated this way, its full content will be provided in <activated_skills> — you don't need to use ReadSkill for those.

Skills follow a progressive disclosure pattern:
- Skill metadata (name, description) is loaded at startup via <available_skills>
- Full skill instructions are loaded when you Read SKILL.md or when the user activates them via /skillname
- Additional resources are loaded on demand as needed`
}

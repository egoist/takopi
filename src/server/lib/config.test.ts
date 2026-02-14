import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { join } from "node:path"
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { existsSync } from "node:fs"
import type { Config } from "@/types/config"

let tempDir: string

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>()
  return {
    ...actual,
    homedir: () => tempDir,
  }
})

let getConfig: typeof import("./config").getConfig
let saveConfig: typeof import("./config").saveConfig
let ensureConfigDir: typeof import("./config").ensureConfigDir

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "takopi-config-test-"))
  delete process.env.TAKOPI_ROOT
  vi.resetModules()
  const mod = await import("./config")
  getConfig = mod.getConfig
  saveConfig = mod.saveConfig
  ensureConfigDir = mod.ensureConfigDir
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe("config", () => {
  describe("getConfig", () => {
    it("returns default config when no config file exists", async () => {
      const config = await getConfig()
      expect(config).toEqual({
        providers: [],
        agents: [],
        defaultAgent: undefined,
      })
    })

    it("creates .takopi directory if it does not exist", async () => {
      await getConfig()
      expect(existsSync(join(tempDir, ".takopi"))).toBe(true)
    })

    it("uses TAKOPI_ROOT when set", async () => {
      const customRoot = join(tempDir, "custom-root")
      process.env.TAKOPI_ROOT = customRoot

      await getConfig()

      expect(existsSync(customRoot)).toBe(true)
      expect(existsSync(join(customRoot, "config.json"))).toBe(false)
    })

    it("expands tilde in TAKOPI_ROOT", async () => {
      process.env.TAKOPI_ROOT = "~/takopi-custom"

      await saveConfig({
        providers: [],
        agents: [],
        defaultAgent: undefined
      })

      expect(existsSync(join(tempDir, "takopi-custom", "config.json"))).toBe(true)
    })
  })

  describe("saveConfig / getConfig roundtrip", () => {
    it("saves and retrieves config", async () => {
      const config: Config = {
        providers: [
          {
            id: "p1",
            name: "OpenAI",
            type: "openai",
            apiKey: "sk-test",
            models: [{ id: "gpt-4", name: "GPT-4" }],
          },
        ],
        agents: [{ id: "a1", name: "Test Agent", model: "p1/gpt-4" }],
        defaultAgent: "a1",
      }

      await saveConfig(config)
      const retrieved = await getConfig()

      expect(retrieved.providers).toHaveLength(1)
      expect(retrieved.providers[0].name).toBe("OpenAI")
      expect(retrieved.agents).toHaveLength(1)
      expect(retrieved.defaultAgent).toBe("a1")
    })

    it("writes valid JSON to disk", async () => {
      const config: Config = {
        providers: [],
        agents: [],
        defaultAgent: undefined,
      }

      await saveConfig(config)

      const raw = await readFile(join(tempDir, ".takopi", "config.json"), "utf-8")
      expect(() => JSON.parse(raw)).not.toThrow()
    })
  })

  describe("backward compatibility", () => {
    it("ensures providers have models array even if missing", async () => {
      const configDir = join(tempDir, ".takopi")
      await mkdir(configDir, { recursive: true })
      await writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          providers: [{ id: "p1", name: "Test", type: "openai", apiKey: "k" }],
          agents: [],
        }),
        "utf-8",
      )

      vi.resetModules()
      const mod = await import("./config")
      const config = await mod.getConfig()

      expect(config.providers[0].models).toEqual([])
    })
  })
})

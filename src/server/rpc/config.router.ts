import z from "zod"
import { base } from "./base"
import { getConfig, saveConfig, initializeAgentWorkspace } from "../lib/config"
import type { Config } from "@/types/config"

export const configRouter = {
  getConfig: base.handler(async () => {
    const config = await getConfig()
    return config
  }),

  updateConfig: base.input(z.custom<Partial<Config>>()).handler(async ({ input }) => {
    const currentConfig = await getConfig()

    const existingAgentIds = new Set(currentConfig.agents.map((a) => a.id))
    const newAgents = (input.agents || []).filter((a) => !existingAgentIds.has(a.id))

    await saveConfig({
      ...currentConfig,
      ...input
    })

    // Initialize workspace files for newly added agents
    await Promise.all(newAgents.map((a) => initializeAgentWorkspace(a.id)))

    return { success: true }
  })
}

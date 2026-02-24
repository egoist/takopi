import z from "zod"
import { base } from "./base"
import { getConfig, saveConfig, initializeAgentWorkspace } from "../lib/config"
import type { Config } from "@/types/config"
import { syncTelegramBot } from "../lib/telegram"
import {
  getTelegramPendingUsers,
  removeApprovedUsersFromPending,
  removeTelegramPendingUser
} from "../lib/telegram-pending-users"

export const configRouter = {
  getConfig: base.handler(async () => {
    const config = await getConfig()
    syncTelegramBot(config)
    return config
  }),

  getTelegramPendingUsers: base.handler(async () => {
    const config = await getConfig()
    const approvedUserIds = config.telegram?.approvedUserIds ?? []
    await removeApprovedUsersFromPending(approvedUserIds)
    const pendingUsers = await getTelegramPendingUsers()
    return pendingUsers
  }),

  approveTelegramUser: base
    .input(
      z.object({
        userId: z.number()
      })
    )
    .handler(async ({ input }) => {
      const currentConfig = await getConfig()
      const approvedUserIds = new Set(currentConfig.telegram?.approvedUserIds ?? [])
      approvedUserIds.add(input.userId)

      const nextConfig: Config = {
        ...currentConfig,
        telegram: {
          ...(currentConfig.telegram ?? {}),
          approvedUserIds: [...approvedUserIds]
        }
      }

      await saveConfig(nextConfig)
      syncTelegramBot(nextConfig)
      await removeTelegramPendingUser(input.userId)

      return { success: true }
    }),

  rejectTelegramUser: base
    .input(
      z.object({
        userId: z.number()
      })
    )
    .handler(async ({ input }) => {
      await removeTelegramPendingUser(input.userId)
      return { success: true }
    }),

  updateConfig: base.input(z.custom<Partial<Config>>()).handler(async ({ input }) => {
    const currentConfig = await getConfig()

    const existingAgentIds = new Set(currentConfig.agents.map((a) => a.id))
    const newAgents = (input.agents || []).filter((a) => !existingAgentIds.has(a.id))

    const nextConfig = {
      ...currentConfig,
      ...input
    }

    await saveConfig(nextConfig)
    syncTelegramBot(nextConfig)

    // Initialize workspace files for newly added agents
    await Promise.all(newAgents.map((a) => initializeAgentWorkspace(a.id)))

    return { success: true }
  })
}

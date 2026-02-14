import z from "zod"
import { base } from "./base"
import { PROVIDERS, PROVIDER_TYPES } from "@/lib/providers"
import { getConfig, saveConfig } from "../lib/config"
import type { ProviderConfig } from "@/types/config"
import { fetchModelsJSONWithCache, getModelsFromModelsJSON } from "../lib/fetch-models-json"

export const providerRouter = {
  addProvider: base
    .input(
      z.object({
        name: z.string().optional(),
        type: z.enum(PROVIDER_TYPES),
        baseUrl: z.string().optional(),
        apiKey: z.string().optional(),
        models: z.array(
          z.object({
            id: z.string(),
            name: z.string()
          })
        )
      })
    )
    .handler(async ({ input }) => {
      const currentConfig = await getConfig()
      // Get default provider name from PROVIDERS constant
      const defaultProvider = PROVIDERS.find((p) => p.type === input.type)
      const defaultName = defaultProvider ? defaultProvider.name : input.type

      // Count existing providers of the same type to append index if needed
      const existingCount = currentConfig.providers.filter((p) => p.type === input.type).length
      const name =
        input.name || (existingCount > 0 ? `${defaultName} ${existingCount + 1}` : defaultName)

      const newProvider: ProviderConfig = {
        id: `provider-${Date.now()}`,
        name,
        type: input.type,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        models: input.models
      }
      const newConfig = {
        ...currentConfig,
        providers: [...currentConfig.providers, newProvider]
      }
      await saveConfig(newConfig)
      return newProvider
    }),

  removeProvider: base
    .input(
      z.object({
        providerId: z.string()
      })
    )
    .handler(async ({ input }) => {
      const currentConfig = await getConfig()
      const newConfig = {
        ...currentConfig,
        providers: currentConfig.providers.filter((p) => p.id !== input.providerId)
      }
      await saveConfig(newConfig)
      return { success: true }
    }),

  fetchModelsFromAPI: base
    .input(
      z.object({
        providerType: z.enum(PROVIDER_TYPES)
      })
    )
    .handler(async ({ input }) => {
      try {
        const data = await fetchModelsJSONWithCache()

        const models = getModelsFromModelsJSON(data, input.providerType)

        const result = Object.entries(models).map(([id, model]) => {
          return {
            id: model.id,
            name: model.name
          }
        })

        return { models: result }
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Failed to fetch models")
      }
    })
}

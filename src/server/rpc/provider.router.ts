import z from "zod"
import { base } from "./base"
import { PROVIDER_TYPES } from "@/lib/providers"
import { fetchModelsJSONWithCache, getModelsFromModelsJSON } from "../lib/fetch-models-json"

function getModelType(modelId: string): "chat" | "embedding" {
  return modelId.toLowerCase().includes("embedding") ? "embedding" : "chat"
}

export const providerRouter = {
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
            name: model.name,
            type: getModelType(id)
          }
        })

        return { models: result }
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Failed to fetch models")
      }
    })
}

import type { ModelsJSON } from "@/types/index"

export async function fetchModelsJSON() {
  const response = await fetch("https://models.dev/api.json")
  if (!response.ok) {
    throw new Error("Failed to fetch models from models.dev")
  }

  const data = (await response.json()) as ModelsJSON

  return data
}

const TWO_HOURS = 2 * 60 * 60 * 1000

let cache: { data: ModelsJSON; timestamp: number } | null = null

export async function fetchModelsJSONWithCache() {
  if (cache) {
    if (Date.now() - cache.timestamp >= TWO_HOURS) {
      fetchModelsJSON()
        .then((data) => {
          cache = { data, timestamp: Date.now() }
        })
        .catch(() => {})
    }

    return cache.data
  }

  const data = await fetchModelsJSON()
  cache = { data, timestamp: Date.now() }
  return data
}

export function getModelsFromModelsJSON(modelsJSON: ModelsJSON, providerType: string) {
  // include a subset of openai models for the codex provider
  if (providerType === "codex") {
    const openAIModels = modelsJSON.openai?.models || {}
    const filteredModels = Object.fromEntries(
      Object.entries(openAIModels).filter(
        ([modelId]) => modelId.includes("codex") || modelId === "gpt-5.2"
      )
    )

    if (Object.keys(filteredModels).length > 0) {
      return filteredModels
    }

    return {}
  }

  return modelsJSON[providerType]?.models || {}
}

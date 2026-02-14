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
  return modelsJSON[providerType]?.models || {}
}

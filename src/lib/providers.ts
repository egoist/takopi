import { getModelsFromModelsJSON } from "@/server/lib/fetch-models-json"
import type { Config, ModelConfig, ProviderConfig } from "@/types/config"
import type { ModelsJSON } from "@/types/index"

export const PROVIDERS = [
  { type: "openai", name: "OpenAI" },
  { type: "anthropic", name: "Anthropic" },
  { type: "deepseek", name: "DeepSeek" },
  { type: "openrouter", name: "OpenRouter" },
  { type: "opencode", name: "OpenCode Zen" },
  { type: "zai", name: "Z.ai" },
  { type: "vercel", name: "Vercel" }
] as const

export const PROVIDER_TYPES = PROVIDERS.map((p) => p.type)

export type ProviderType = (typeof PROVIDERS)[number]["type"]

export function parseFullModelId(fullModelId: string) {
  const index = fullModelId.indexOf("/")
  const providerId = fullModelId.slice(0, index)
  const modelId = fullModelId.slice(index + 1)
  return { providerId, modelId }
}

export function getModelConfig(
  modelsJSON: ModelsJSON,
  config: Config,
  fullModelId: string
): {
  model: ModelConfig | null
  provider: ProviderConfig | null
  providerId: string
  modelId: string
} {
  const { providerId, modelId } = parseFullModelId(fullModelId)

  for (const provider of config.providers) {
    if (provider.id === providerId) {
      const model = provider.models.find((m) => m.id === modelId)
      if (model) {
        const defaultModelConfig = getModelsFromModelsJSON(modelsJSON, provider.type)[modelId]

        return { model: { ...defaultModelConfig, ...model }, providerId, modelId, provider }
      }

      return {
        provider,
        providerId,
        modelId,
        model: null
      }
    }
  }

  return { model: null, providerId, modelId, provider: null }
}

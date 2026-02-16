import { getModelsFromModelsJSON } from "@/server/lib/fetch-models-json"
import type { Config, ModelConfig, ProviderConfig } from "@/types/config"
import type { ModelsJSON } from "@/types/index"

export const OPENAI_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
export const OPENAI_OAUTH_ISSUER = "https://auth.openai.com"
export const OPENAI_OAUTH_SCOPE = "openid profile email offline_access"

export const PROVIDERS = [
  {
    type: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1"
  },
  {
    type: "codex",
    name: "Codex",
    defaultBaseUrl: "https://chatgpt.com/backend-api/codex",
    oauth: {
      issuer: OPENAI_OAUTH_ISSUER,
      clientId: OPENAI_OAUTH_CLIENT_ID,
      scope: OPENAI_OAUTH_SCOPE
    }
  },
  { type: "anthropic", name: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1" },
  {
    type: "google",
    name: "Google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta"
  },
  { type: "deepseek", name: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com/v1" },
  { type: "openrouter", name: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { type: "opencode", name: "OpenCode Zen", defaultBaseUrl: "https://api.opencode.ai/v1" },
  { type: "zai", name: "Z.ai", defaultBaseUrl: "https://api.z.ai/api/paas/v4" },
  { type: "vercel", name: "Vercel", defaultBaseUrl: "https://ai-gateway.vercel.sh/v3/ai" }
] as const

export const PROVIDER_TYPES = PROVIDERS.map((p) => p.type)

export type ProviderType = (typeof PROVIDERS)[number]["type"]

export function getProviderInfo(type: ProviderType) {
  return PROVIDERS.find((provider) => provider.type === type)
}

export function getProviderDefaultBaseUrl(type: ProviderType) {
  return getProviderInfo(type)?.defaultBaseUrl ?? ""
}

export function isOAuthProvider(type: ProviderType) {
  const provider = getProviderInfo(type)
  return Boolean(provider && "oauth" in provider)
}

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

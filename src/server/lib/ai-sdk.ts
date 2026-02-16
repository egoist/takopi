import type { ModelConfig, ProviderConfig, Config } from "@/types/config"
import { parseFullModelId } from "@/lib/providers"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createGateway } from "ai"
import { match } from "ts-pattern"
import { createZhipu } from "zhipu-ai-provider"
import { getConfig, saveConfig } from "./config"
import { refreshOpenAIAccessToken } from "./openai-oauth"

function getProviderCredential(providerConfig: ProviderConfig) {
  if (providerConfig.type === "codex") {
    return providerConfig.oauth?.accessToken
  }
  return providerConfig.apiKey
}

const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

async function ensureFreshCodexToken(providerConfig: ProviderConfig) {
  if (providerConfig.type !== "codex") {
    return {
      accessToken: providerConfig.apiKey || "",
      accountId: undefined as string | undefined
    }
  }

  const oauth = providerConfig.oauth
  if (!oauth?.accessToken) {
    throw new Error("Codex provider is not connected. Please sign in again.")
  }

  const expiresAt = oauth.expiresAt
  const shouldRefresh =
    typeof expiresAt === "number" && expiresAt - Date.now() <= TOKEN_REFRESH_BUFFER_MS
  if (!shouldRefresh) {
    return {
      accessToken: oauth.accessToken,
      accountId: oauth.accountId
    }
  }

  if (!oauth.refreshToken) {
    return {
      accessToken: oauth.accessToken,
      accountId: oauth.accountId
    }
  }
  const refreshed = await refreshOpenAIAccessToken({
    refreshToken: oauth.refreshToken || ""
  })

  const mergedOAuth = {
    provider: "codex" as const,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || oauth.refreshToken,
    expiresAt: refreshed.expiresAt || oauth.expiresAt,
    accountId: refreshed.accountId || oauth.accountId
  }

  providerConfig.oauth = mergedOAuth
  providerConfig.authType = "oauth"

  const currentConfig = await getConfig()
  const nextProviders = currentConfig.providers.map((provider) => {
    if (provider.id !== providerConfig.id) {
      return provider
    }

    return {
      ...provider,
      authType: "oauth" as const,
      oauth: mergedOAuth
    }
  })

  await saveConfig({
    ...currentConfig,
    providers: nextProviders
  })

  return {
    accessToken: providerConfig.oauth?.accessToken || oauth.accessToken,
    accountId: providerConfig.oauth?.accountId || oauth.accountId
  }
}

export function getAISDKLanguageModel({
  modelConfig,
  providerConfig
}: {
  modelConfig: ModelConfig
  providerConfig: ProviderConfig
}) {
  const apiKey = getProviderCredential(providerConfig)
  const modelId = modelConfig.id
  const baseUrlOption = providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl.trim() } : {}

  return match(providerConfig.type)
    .with("anthropic", () => {
      const anthropic = createAnthropic({ apiKey, ...baseUrlOption })
      return anthropic(modelId)
    })
    .with("zai", () => {
      const zhipu = createZhipu({ apiKey, ...baseUrlOption })
      return zhipu(modelId)
    })
    .with("deepseek", () => {
      const deepseek = createDeepSeek({ apiKey, ...baseUrlOption })
      return deepseek(modelId)
    })
    .with("google", () => {
      const google = createGoogleGenerativeAI({ apiKey, ...baseUrlOption })
      return google(modelId)
    })
    .with("opencode", () => {
      const baseURL = providerConfig.baseUrl || "https://opencode.ai/zen/v1"
      return match(modelId)
        .when(
          (id) => id.startsWith("gpt-"),
          () => createOpenAI({ apiKey, baseURL }).responses(modelId)
        )
        .when(
          (id) => id.startsWith("gemini-"),
          () => createGoogleGenerativeAI({ apiKey, baseURL })(modelId)
        )
        .when(
          (id) => id.startsWith("claude-"),
          () => createAnthropic({ apiKey, baseURL })(modelId)
        )
        .otherwise(() =>
          createOpenAICompatible({
            name: "opencode",
            apiKey,
            baseURL
          })(modelId)
        )
    })
    .with("openrouter", () => {
      const openrouter = createOpenRouter({ apiKey, ...baseUrlOption })
      return openrouter(modelId)
    })
    .with("openai", () => {
      const openai = createOpenAI({ apiKey, ...baseUrlOption })
      return openai.responses(modelId)
    })
    .with("codex", () => {
      const openai = createOpenAI({
        apiKey,
        baseURL: providerConfig.baseUrl?.trim() || "https://chatgpt.com/backend-api/codex",
        fetch: async (input, init) => {
          const auth = await ensureFreshCodexToken(providerConfig)
          const headers = new Headers(init?.headers)
          headers.set("authorization", `Bearer ${auth.accessToken}`)
          if (auth.accountId) {
            headers.set("ChatGPT-Account-Id", auth.accountId)
          } else {
            headers.delete("ChatGPT-Account-Id")
          }

          return fetch(input, {
            ...init,
            headers
          })
        },
        headers: providerConfig.oauth?.accountId
          ? {
              "ChatGPT-Account-Id": providerConfig.oauth.accountId
            }
          : undefined
      })
      return openai.responses(modelId)
    })
    .with("vercel", () => {
      const gateway = createGateway({ apiKey, ...baseUrlOption })
      return gateway(modelId)
    })
    .exhaustive()
}

export function getAISDKEmbeddingModel(config: Config) {
  if (!config.embeddingModel) return null

  const { providerId, modelId } = parseFullModelId(config.embeddingModel)
  const provider = config.providers.find((p) => p.id === providerId)
  if (!provider) return null

  if (provider.type === "codex") {
    return null
  }

  const apiKey = getProviderCredential(provider)
  if (!apiKey) return null
  const baseUrlOption = provider.baseUrl ? { baseURL: provider.baseUrl.trim() } : {}
  return match(provider.type)
    .with("openai", () => {
      return createOpenAI({ apiKey, ...baseUrlOption }).embedding(modelId)
    })
    .with("openrouter", () => {
      return createOpenRouter({ apiKey, ...baseUrlOption }).textEmbeddingModel(modelId)
    })
    .with("zai", () => {
      return createZhipu({ apiKey, ...baseUrlOption }).textEmbeddingModel(modelId)
    })
    .with("opencode", () => {
      const baseURL = provider.baseUrl || "https://opencode.ai/zen/v1"
      return createOpenAICompatible({ name: "opencode", apiKey, baseURL }).embeddingModel(modelId)
    })
    .with("anthropic", () => {
      return createAnthropic({ apiKey, ...baseUrlOption }).embeddingModel(modelId)
    })
    .with("deepseek", () => {
      return createDeepSeek({ apiKey, ...baseUrlOption }).embeddingModel(modelId)
    })
    .with("google", () => {
      return createGoogleGenerativeAI({ apiKey, ...baseUrlOption }).textEmbeddingModel(modelId)
    })
    .with("vercel", () => {
      return createGateway({ apiKey, ...baseUrlOption }).embeddingModel(modelId)
    })
    .exhaustive()
}

export function getProviderOptions() {
  const options: {
    openai: OpenAIResponsesProviderOptions
  } = {
    openai: {
      store: false,
      instructions: ""
    }
  }

  return options
}

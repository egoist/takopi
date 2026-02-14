import type { ModelConfig, ProviderConfig, Config } from "@/types/config"
import { parseFullModelId } from "@/lib/providers"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createGateway } from "ai"
import { match } from "ts-pattern"
import { createZhipu } from "zhipu-ai-provider"

export function getAISDKLanguageModel({
  modelConfig,
  providerConfig
}: {
  modelConfig: ModelConfig
  providerConfig: ProviderConfig
}) {
  const apiKey = providerConfig.apiKey
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
  if (!provider || !provider.apiKey) return null

  const apiKey = provider.apiKey
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
    .with("vercel", () => {
      return createGateway({ apiKey, ...baseUrlOption }).embeddingModel(modelId)
    })
    .exhaustive()
}

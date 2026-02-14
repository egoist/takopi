import type { GeneratedFile, LanguageModelUsage } from "ai"
import type { ModelConfig } from "@/types/config"

export type GoogleUsageMetadata = {
  candidatesTokensDetails?: Array<{
    modality?: string
    tokenCount?: number
  }>
  thoughtsTokenCount?: number
}

export type CustomAIProviderMetadata = {
  google?: {
    usageMetadata?: GoogleUsageMetadata
  }
}

export type AIUsage = {
  inputTokens: number
  outputTokens: number
  outputTextTokens: number
  outputImageTokens: number
  outputImagesCount: number
  inputCost: number
  outputTextCost: number
  outputImagesCost: number
  outputCost: number
  totalCost: number
}

export type UsageCalculatorUsage = AIUsage

export const createUsageCalculator = (model: ModelConfig) => {
  const result = {
    inputTokens: 0,
    outputTextTokens: 0,
    outputImageTokens: 0,
    outputImagesCount: 0,
    inputCost: 0,
    outputTextCost: 0,
    outputImagesCost: 0
  }

  const MILLION = 1_000_000

  return {
    updateForStep: ({
      usage,
      providerMetadata,
      files,
      modelConfig
    }: {
      usage?: LanguageModelUsage
      providerMetadata?: CustomAIProviderMetadata
      files?: GeneratedFile[]
      modelConfig?: ModelConfig
    }) => {
      const inputTokens = usage?.inputTokens ?? 0
      const defaultOutputTextTokens = usage?.outputTokens ?? 0
      const googleUsageMetadata = providerMetadata?.google?.usageMetadata

      let outputTextTokens = defaultOutputTextTokens
      let outputImageTokens = 0

      if (googleUsageMetadata) {
        outputTextTokens = googleUsageMetadata.thoughtsTokenCount ?? 0
        for (const tokenDetail of googleUsageMetadata.candidatesTokensDetails ?? []) {
          if (tokenDetail.modality === "TEXT") {
            outputTextTokens += tokenDetail.tokenCount ?? 0
          }

          if (tokenDetail.modality === "IMAGE") {
            outputImageTokens += tokenDetail.tokenCount ?? 0
          }
        }
      }

      const outputImagesCount = (files ?? []).filter((file) =>
        file.mediaType.startsWith("image/")
      ).length
      const modelForStep = modelConfig ?? model
      const inputCostPerMillion = modelForStep.cost?.input ?? 0
      const outputCostPerMillion = modelForStep.cost?.output ?? 0

      result.inputTokens += inputTokens
      result.outputTextTokens += outputTextTokens
      result.outputImageTokens += outputImageTokens
      result.outputImagesCount += outputImagesCount
      result.inputCost += (inputTokens / MILLION) * inputCostPerMillion
      result.outputTextCost += (outputTextTokens / MILLION) * outputCostPerMillion
    },
    get usage(): AIUsage {
      const outputTokens = result.outputTextTokens + result.outputImageTokens
      const inputCost = result.inputCost
      const outputTextCost = result.outputTextCost
      const outputImagesCost = result.outputImagesCost
      const outputCost = outputTextCost + outputImagesCost
      const totalCost = inputCost + outputCost

      return {
        inputTokens: result.inputTokens,
        outputTokens,
        outputTextTokens: result.outputTextTokens,
        outputImageTokens: result.outputImageTokens,
        outputImagesCount: result.outputImagesCount,
        inputCost,
        outputTextCost,
        outputImagesCost,
        outputCost,
        totalCost
      }
    }
  }
}

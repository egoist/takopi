import { embedMany, embed } from "ai"
import type { Config } from "@/types/config"
import type { EmbedFn } from "./memory-index"
import { getAISDKEmbeddingModel } from "./ai-sdk"

export function createEmbedFn(config: Config): EmbedFn | null {
  const model = getAISDKEmbeddingModel(config)
  if (!model) return null

  return async (texts: string[]) => {
    const { embeddings } = await embedMany({ model, values: texts })
    return embeddings
  }
}

export async function embedQuery(config: Config, text: string): Promise<number[] | null> {
  const model = getAISDKEmbeddingModel(config)
  if (!model) return null
  console.log(`Generating embedding with model ${model} for query: ${text}`)
  const { embedding } = await embed({ model, value: text })
  return embedding
}

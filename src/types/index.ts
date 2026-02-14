import type { ModelConfig } from "./config"

export type ModelsJSON = {
  [providerId: string]: {
    id: string
    name: string
    models: Record<string, ModelConfig>
  }
}

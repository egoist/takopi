import type { ProviderType } from "@/lib/providers"

export interface ModelConfig {
  id: string
  name: string
  knowledge?: string
  release_date?: string
  last_updated?: string
  modalities?: {
    input?: Array<"text" | "image" | "audio">
    output?: Array<"text" | "image">
  }
  cost?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
  limit?: {
    context?: number
    output?: number
  }
}

export interface ProviderConfig {
  id: string
  name?: string
  type: ProviderType
  baseUrl?: string
  apiKey?: string
  models: ModelConfig[]
}

export interface AgentConfig {
  id: string
  name: string
  model: string
}

export type WebSearchProvider = "exa" | "braveSearch" | "command"
export type WebFetchProvider = "exa" | "command" | "fetch"

export interface ExaConfig {
  apiKey?: string
}

export interface BraveSearchConfig {
  apiKey?: string
}

export interface Config {
  providers: ProviderConfig[]
  agents: AgentConfig[]
  defaultAgent?: string
  embeddingModel?: string // "providerId/modelId"
  webSearchProvider?: WebSearchProvider
  exa?: ExaConfig
  braveSearch?: BraveSearchConfig
  webSearchCommand?: string
  webFetchProvider?: WebFetchProvider
  webFetchCommand?: string
}

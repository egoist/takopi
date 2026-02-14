import type { CustomUIMessageMetadata, CustomUIMessagePart } from "@/lib/types"

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: CustomUIMessagePart[]
  metadata?: CustomUIMessageMetadata
  createdAt: number
  nextMessageIds?: string[]
  nextMessageId?: string
  agent: string
}

export interface Chat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  agent: string
  lastReplyAt?: number
}

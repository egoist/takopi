import type { ToolUIPart, UIMessage, UIMessagePart } from "ai"
import { type CustomUITools } from "@/server/lib/ai-tools"
import type { UsageCalculatorUsage } from "@/lib/ai"

export type CustomUIMessageMetadata = {
  reasoningDurations?: Record<number, number>
  timeToFirstToken?: number
  duration?: number
  mainUsage?: UsageCalculatorUsage
  taskUsages?: Record<string, UsageCalculatorUsage>
  stopEarly?:
    | {
        type: "max-steps"
        maxSteps: number
      }
    | {
        type: "max-cost"
        maxCost: number
      }
}

export type CustomUIDataTypes = {}

export type CustomUIMessage = UIMessage<CustomUIMessageMetadata, CustomUIDataTypes, CustomUITools>

export type CustomUIMessagePart = UIMessagePart<CustomUIDataTypes, CustomUITools>

export type CustomToolUIPart = ToolUIPart<CustomUITools>

export type ToolConfirmation = {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  status: "pending" | "approved" | "rejected"
}

export type UserQuestionOption = {
  label: string
  description: string
}

export type UserQuestion = {
  question: string
  header: string
  options: UserQuestionOption[]
  multiSelect: boolean
}

export type UserQuestionRequest = {
  toolCallId: string
  questions: UserQuestion[]
  status: "pending" | "answered" | "timeout"
}

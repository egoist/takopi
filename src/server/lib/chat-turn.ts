import { readUIMessageStream, stepCountIs, streamText } from "ai"
import { getModelConfig } from "@/lib/providers"
import type { CustomUIMessage, CustomUIMessageMetadata, CustomUIMessagePart } from "@/lib/types"
import { createUsageCalculator } from "@/lib/ai"
import type { ChatMessage } from "@/types/chat"
import type { Config } from "@/types/config"
import { getChat, saveChat, saveChatMessages } from "./chat-storage"
import { createAITools, type AIToolSet, type RequestConfirmation, type RequestUserAnswer } from "./ai-tools"
import { getAISDKLanguageModel, getProviderOptions } from "./ai-sdk"
import { fetchModelsJSONWithCache } from "./fetch-models-json"
import { processMessages } from "./message"
import { getAgentWorkspaceDir } from "./paths"
import { getDisplayedMessages } from "@/lib/chat"

export interface RunChatTurnOptions {
  config: Config
  messages: ChatMessage[]
  chatId: string
  agentId: string
  maxSteps: number
  requestConfirmation: RequestConfirmation
  requestUserAnswer: RequestUserAnswer
  abortController?: AbortController
  activeTools?: string[]
  onTitle?: (title: string) => void | Promise<void>
  onPart?: (payload: { index: number; part: CustomUIMessagePart }) => void | Promise<void>
  onMetadata?: (metadata: CustomUIMessageMetadata) => void | Promise<void>
  onTextDelta?: (delta: string) => void | Promise<void>
}

export interface RunChatTurnResult {
  text: string
  metadata: CustomUIMessageMetadata
  parts: CustomUIMessagePart[]
}

function normalizeAssistantText(text: string): string {
  const normalized = text.trim()
  return normalized || "I could not generate a reply."
}

export async function runChatTurn(options: RunChatTurnOptions): Promise<RunChatTurnResult> {
  const {
    config,
    messages,
    chatId,
    agentId,
    maxSteps,
    requestConfirmation,
    requestUserAnswer,
    activeTools,
    onTitle,
    onPart,
    onMetadata,
    onTextDelta
  } = options

  const agent = config.agents.find((entry) => entry.id === agentId)
  if (!agent || !agent.model) {
    throw new Error("Selected agent not found or has no model configured.")
  }

  const modelsJSON = await fetchModelsJSONWithCache()
  const { model, provider } = getModelConfig(modelsJSON, config, agent.model)

  if (!provider) {
    throw new Error("Provider for the agent's model not found in config")
  }

  if (!model) {
    throw new Error("Model not found in config")
  }

  await saveChatMessages(chatId, messages)

  const displayedMessages = getDisplayedMessages(messages).displayedMessages
  const assistantMessage = displayedMessages[displayedMessages.length - 1]
  const userMessage = displayedMessages[displayedMessages.length - 2]

  if (!assistantMessage || !userMessage) {
    throw new Error("Invalid chat state: expected user and assistant messages.")
  }

  let chat = chatId ? await getChat(chatId) : null

  const userMessageText = userMessage.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")

  if (!chat) {
    const title = userMessageText.slice(0, 100) || "New Chat"
    if (onTitle) {
      await onTitle(title)
    }

    chat = await saveChat({
      id: chatId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agent: agentId
    })
  }

  const workspaceDir = getAgentWorkspaceDir(agentId)
  const { modelMessages, skills, systemMessages } = await processMessages(
    displayedMessages.slice(0, -1),
    {
      workingDirectory: workspaceDir,
      model,
      agentId
    }
  )

  const reasoningStartAt: Record<number, number> = {}
  const reasoningDurations: Record<number, number> = {}
  const finishedReasoningIndices = new Set<number>()
  const parts: CustomUIMessagePart[] = []
  const metadata: CustomUIMessageMetadata = {
    reasoningDurations
  }
  const startAt = Date.now()

  const usageCalculator = createUsageCalculator(model)
  const taskUsageCalculators: Record<string, ReturnType<typeof createUsageCalculator>> = {}

  const emitMetadata = async () => {
    if (onMetadata) {
      await onMetadata(metadata)
    }
  }

  const updateUsageMetadata = async () => {
    metadata.mainUsage = usageCalculator.usage
    await emitMetadata()
  }

  const saveChatState = async () => {
    if (!chat) {
      return
    }

    chat.updatedAt = Date.now()
    await Promise.all([
      saveChat(chat),
      saveChatMessages(
        chatId,
        messages.map((message) => {
          if (message.id === assistantMessage.id) {
            return {
              ...assistantMessage,
              content: parts,
              metadata
            }
          }
          return message
        })
      )
    ])
  }

  const sdkLanguageModel = getAISDKLanguageModel({
    modelConfig: model,
    providerConfig: provider
  })

  const abortController = options.abortController ?? new AbortController()
  const chatSession = {}

  const tools = createAITools({
    chatId,
    agentId,
    chatSession,
    signal: abortController.signal,
    skills,
    requestConfirmation,
    requestUserAnswer,
    config,
    onUsageUpdate: ({ taskToolCallId, usage, providerMetadata, files, modelConfig }) => {
      if (!taskToolCallId) {
        return
      }

      const taskUsageCalculator =
        taskUsageCalculators[taskToolCallId] ??
        (taskUsageCalculators[taskToolCallId] = createUsageCalculator(modelConfig ?? model))

      taskUsageCalculator.updateForStep({
        usage,
        providerMetadata,
        files,
        modelConfig
      })

      metadata.taskUsages = {
        ...(metadata.taskUsages ?? {}),
        [taskToolCallId]: taskUsageCalculator.usage
      }
      void emitMetadata()
    }
  })

  const availableTools = Object.keys(tools) as (keyof typeof tools)[]
  const activeToolNames = activeTools
    ? (() => {
        const activeToolSet = new Set(activeTools)
        return availableTools.filter((toolName) => activeToolSet.has(String(toolName)))
      })()
    : availableTools

  const result = streamText<AIToolSet>({
    model: sdkLanguageModel,
    system: systemMessages,
    providerOptions: getProviderOptions(),
    messages: modelMessages,
    tools,
    activeTools: activeToolNames,
    abortSignal: abortController.signal,
    async onFinish() {
      await updateUsageMetadata()
      await saveChatState()
    },
    async onStepFinish({ usage, providerMetadata, files }) {
      usageCalculator.updateForStep({
        usage,
        providerMetadata,
        files
      })
      await updateUsageMetadata()
      await saveChatState()
    },
    async onAbort() {
      await updateUsageMetadata()
      await saveChatState()
    },
    stopWhen: [
      stepCountIs(maxSteps),
      (ctx) => {
        if (ctx.steps.length === maxSteps) {
          metadata.stopEarly = {
            type: "max-steps",
            maxSteps
          }

          return true
        }

        return false
      }
    ]
  })

  const textStreamTask = onTextDelta
    ? (async () => {
        for await (const delta of result.textStream) {
          await onTextDelta(delta)
        }
      })()
    : Promise.resolve()

  const uiMessageStream = result.toUIMessageStream<CustomUIMessage>()
  for await (const uiMessage of readUIMessageStream<CustomUIMessage>({
    stream: uiMessageStream
  })) {
    if (!metadata.timeToFirstToken) {
      metadata.timeToFirstToken = Date.now() - startAt
    }
    metadata.duration = Date.now() - startAt

    await emitMetadata()

    for (const [index, part] of uiMessage.parts.entries()) {
      if (part.type === "reasoning" && !finishedReasoningIndices.has(index)) {
        const startedAt = reasoningStartAt[index] || Date.now()
        reasoningStartAt[index] = startedAt
        reasoningDurations[index] = Date.now() - startedAt

        if (part.state === "done") {
          finishedReasoningIndices.add(index)
        }
      }

      parts[index] = part
      if (onPart) {
        await onPart({
          index,
          part
        })
      }
    }
  }

  await textStreamTask

  return {
    text: normalizeAssistantText(await result.text),
    metadata,
    parts
  }
}

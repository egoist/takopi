import { streamText, readUIMessageStream, stepCountIs } from "ai"
import type { Route } from "./+types/api.chat"
import { getConfig } from "@/server/lib/config"

import { getChat, saveChat, saveChatMessages } from "@/server/lib/chat-storage"
import { getDisplayedMessages } from "@/lib/chat"
import { z } from "zod"
import type { ChatMessage } from "@/types/chat"
import {
  createAITools,
  type AIToolSet,
  type RequestConfirmation,
  type RequestUserAnswer
} from "@/server/lib/ai-tools"
import { waitForConfirmation, cleanupPendingConfirmations } from "@/server/lib/tool-confirmations"
import { waitForQuestionAnswer, cleanupPendingQuestions } from "@/server/lib/user-questions"
import type { CustomUIMessage, CustomUIMessageMetadata, CustomUIMessagePart } from "@/lib/types"
import { streamControllers } from "@/server/lib/redis"
import { streamContext } from "@/server/lib/stream-context"
import { getModelConfig } from "@/lib/providers"
import { processMessages } from "@/server/lib/message"
import { getAISDKLanguageModel } from "@/server/lib/ai-sdk"
import { fetchModelsJSONWithCache } from "@/server/lib/fetch-models-json"
import { getAgentWorkspaceDir } from "@/server/lib/paths"
import { createUsageCalculator } from "@/lib/ai"

const streamHeaders = {
  "Transfer-Encoding": "chunked",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache"
}

const MAX_STEPS = 40

const ChatBodySchema = z.object({
  messages: z.array(z.custom<ChatMessage>()),
  chatId: z.string(),
  agentId: z.string()
})

interface SSEMessage {
  data: string
  event?: string
}

class Writer {
  private closed?: boolean

  constructor(private controller: ReadableStreamDefaultController) {}

  write(message: SSEMessage) {
    if (this.closed) return

    const data = message.data
    const dataLines = data
      .split("\n")
      .map((line) => {
        return `data: ${line}`
      })
      .join("\n")

    const sseData =
      [message.event && `event: ${message.event}`, dataLines].filter(Boolean).join("\n") + "\n\n"

    this.controller.enqueue(sseData)
  }

  error(message: string) {
    this.write({ event: "error", data: message })
    this.close()
  }

  close() {
    if (!this.closed) {
      this.closed = true
      this.controller.close()
    }
  }
}

function errorHandler(error: unknown): string {
  if (error == null) {
    return "unknown error"
  }

  if (typeof error === "string") {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return JSON.stringify(error)
}

const createStream = (handler: (writer: Writer) => Promise<void> | void) => {
  const readable = new ReadableStream({
    async start(controller) {
      const writer = new Writer(controller)

      try {
        await handler(writer)
      } catch (error) {
        writer.error(errorHandler(error))
      } finally {
        writer.close()
      }
    }
  })

  return readable
}

export async function action({ request }: Route.ActionArgs) {
  const config = await getConfig()

  const body = ChatBodySchema.parse(await request.json())
  const { messages, chatId, agentId } = body

  // Clean up any pending confirmations/questions from a previous stream for this chat
  cleanupPendingConfirmations(chatId)
  cleanupPendingQuestions(chatId)

  // Get agent
  const agent = config.agents.find((a) => a.id === agentId)
  if (!agent || !agent.model) {
    return new Response(
      JSON.stringify({
        error: "Selected agent not found or has no model configured."
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    )
  }

  const modelsJSON = await fetchModelsJSONWithCache()
  const { model, provider } = getModelConfig(modelsJSON, config, agent.model)

  if (!provider) {
    throw new Error("Provider for the agent's model not found in config")
  }

  if (!model) {
    throw new Error("Model not found in config")
  }

  const stream = createStream(async (writer) => {
    await saveChatMessages(chatId, messages)

    writer.write({ event: "start", data: "true" })

    const displayedMessages = getDisplayedMessages(messages).displayedMessages
    const assistantMessage = displayedMessages[displayedMessages.length - 1]
    const userMessage = displayedMessages[displayedMessages.length - 2]

    // Get or create chat
    let chat = chatId ? await getChat(chatId) : null

    // Get user message text for title
    const userMessageText = userMessage.content
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("")

    if (!chat) {
      const title = userMessageText.slice(0, 100) || "New Chat"

      writer.write({
        event: "title",
        data: title
      })

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
      // exclude the optimisic assistant message since it's empty
      displayedMessages.slice(0, -1),
      {
        workingDirectory: workspaceDir,
        model,
        agentId
      }
    )

    // Prepare for streaming
    const reasoningStartAt: Record<number, number> = {}
    const reasoningDurations: Record<number, number> = {}
    const finishedReasoningIndices = new Set<number>()
    const parts: CustomUIMessagePart[] = []
    const metadata: CustomUIMessageMetadata = {
      reasoningDurations
    }
    const startAt = Date.now()
    try {
      const sdkLanguageModel = getAISDKLanguageModel({
        modelConfig: model,
        providerConfig: provider
      })

      // Create AI tools
      const abortController = (streamControllers[chatId] = new AbortController())
      const chatSession = {}

      const requestConfirmation: RequestConfirmation = async ({ toolCallId, toolName, args }) => {
        writer.write({
          event: "tool-confirmation",
          data: JSON.stringify({ toolCallId, toolName, args, status: "pending" })
        })
        const approved = await waitForConfirmation(chatId, toolCallId, abortController.signal)
        writer.write({
          event: "tool-confirmation",
          data: JSON.stringify({
            toolCallId,
            toolName,
            args,
            status: approved ? "approved" : "rejected"
          })
        })
        if (!approved) {
          abortController.abort()
        }
        return approved
      }
      const requestUserAnswer: RequestUserAnswer = async ({ toolCallId, questions }) => {
        writer.write({
          event: "user-question",
          data: JSON.stringify({ toolCallId, questions, status: "pending" })
        })
        const answer = await waitForQuestionAnswer(chatId, toolCallId, abortController.signal)
        writer.write({
          event: "user-question",
          data: JSON.stringify({
            toolCallId,
            questions,
            status: answer ? "answered" : "timeout"
          })
        })
        return answer
      }

      const usageCalculator = createUsageCalculator(model)
      const taskUsageCalculators: Record<string, ReturnType<typeof createUsageCalculator>> = {}
      const emitMetadata = () => {
        writer.write({
          event: "metadata",
          data: JSON.stringify(metadata)
        })
      }

      const updateUsageMetadata = () => {
        metadata.mainUsage = usageCalculator.usage
        emitMetadata()
      }

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
          emitMetadata()
        }
      })
      const activeTools = Object.keys(tools) as (keyof typeof tools)[]

      const saveChatState = async () => {
        if (chat) {
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
      }

      const result = streamText<AIToolSet>({
        model: sdkLanguageModel,
        system: systemMessages,
        messages: modelMessages,
        tools,
        activeTools,
        abortSignal: abortController.signal,
        async onFinish() {
          updateUsageMetadata()
          await saveChatState()
        },
        async onStepFinish({ usage, providerMetadata, files }) {
          usageCalculator.updateForStep({
            usage,
            providerMetadata,
            files
          })
          updateUsageMetadata()
          await saveChatState()
        },
        async onAbort() {
          updateUsageMetadata()
          await saveChatState()
        },
        onError({ error }) {
          console.error("Stream error:", error)
          writer.error(errorHandler(error))
        },
        stopWhen: [
          stepCountIs(MAX_STEPS),
          (ctx) => {
            if (ctx.steps.length === MAX_STEPS) {
              metadata.stopEarly = {
                type: "max-steps",
                maxSteps: MAX_STEPS
              }

              return true
            }

            return false
          }
        ]
      })

      // Stream using UI message stream for better part handling
      const uiMessageStream = result.toUIMessageStream<CustomUIMessage>()
      for await (const uiMessage of readUIMessageStream<CustomUIMessage>({
        stream: uiMessageStream
      })) {
        if (!metadata.timeToFirstToken) {
          metadata.timeToFirstToken = Date.now() - startAt
        }
        metadata.duration = Date.now() - startAt

        emitMetadata()

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
          writer.write({
            event: "part",
            data: JSON.stringify({ index, part })
          })
        }
      }
    } catch (error) {
      console.error("Failed to generate response:", error)
      writer.error(errorHandler(error))
    }
  })

  const resumableStream = await streamContext.createNewResumableStream(chatId, () => stream)

  return new Response(resumableStream, {
    headers: streamHeaders
  })
}

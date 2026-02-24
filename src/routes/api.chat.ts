import type { Route } from "./+types/api.chat"
import { getConfig } from "@/server/lib/config"
import { z } from "zod"
import type { ChatMessage } from "@/types/chat"
import { waitForConfirmation, cleanupPendingConfirmations } from "@/server/lib/tool-confirmations"
import { waitForQuestionAnswer, cleanupPendingQuestions } from "@/server/lib/user-questions"
import { streamControllers } from "@/server/lib/redis"
import { streamContext } from "@/server/lib/stream-context"
import { runChatTurn } from "@/server/lib/chat-turn"

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

  const stream = createStream(async (writer) => {
    writer.write({ event: "start", data: "true" })
    try {
      const abortController = (streamControllers[chatId] = new AbortController())
      await runChatTurn({
        config,
        messages,
        chatId,
        agentId,
        maxSteps: MAX_STEPS,
        abortController,
        requestConfirmation: async ({ toolCallId, toolName, args }) => {
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
        },
        requestUserAnswer: async ({ toolCallId, questions }) => {
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
        },
        onTitle: async (title) => {
          writer.write({
            event: "title",
            data: title
          })
        },
        onMetadata: async (metadata) => {
          writer.write({
            event: "metadata",
            data: JSON.stringify(metadata)
          })
        },
        onPart: async ({ index, part }) => {
          writer.write({
            event: "part",
            data: JSON.stringify({ index, part })
          })
        }
      })
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

import type { Chat, ChatMessage } from "@/types/chat"
import { generateId } from "ai"

export const getDisplayedMessages = <T extends ChatMessage>(messages: T[]) => {
  let firstMessage: T | undefined
  const displayedMessages: T[] = []

  const map = new Map(messages.map((m) => [m.id, m]))

  const pushMessage = (message: T) => {
    if (!message.id.startsWith("first:")) {
      displayedMessages.push(message)
    }

    if (message.nextMessageId) {
      const nextMessage = map.get(message.nextMessageId)
      if (nextMessage) {
        pushMessage(nextMessage)
      }
    }
  }

  if (messages.length > 0) {
    if (!messages[0].id.startsWith("first:")) {
      throw new Error("must be first message")
    }
    firstMessage = messages[0]
    pushMessage(messages[0])
  }

  return { displayedMessages, firstMessage, messagesMap: map }
}

export function createUserMessage({
  id,
  input,
  agentId
}: {
  id: string
  input: string
  agentId: string
}): ChatMessage {
  return {
    role: "user",
    id,
    createdAt: Date.now(),
    content: input
      ? [
          {
            type: "text",
            text: input
          }
        ]
      : [],
    nextMessageIds: [],
    metadata: {},
    agent: agentId
  }
}

export function createSpecialUserMessage({
  userMessageId,
  agentId
}: {
  userMessageId: string
  agentId: string
}): ChatMessage {
  return {
    role: "user",
    id: `first:${generateId()}`,
    // ensure it's before any other message
    createdAt: new Date("2000-01-01").getTime(),
    content: [],
    nextMessageIds: [userMessageId],
    nextMessageId: userMessageId,
    metadata: {},
    agent: agentId
  }
}

export function getChatDefault({ chatId, agentId }: { chatId: string; agentId: string }): Chat {
  const now = Date.now()
  return {
    id: chatId,
    createdAt: now,
    updatedAt: now,
    title: "New Chat",
    agent: agentId
  }
}

export function getInitialMessages({ input, agentId }: { input: string; agentId: string }) {
  const userMessageId = generateId()

  return [
    createSpecialUserMessage({
      agentId,
      userMessageId
    }),
    createUserMessage({
      id: userMessageId,
      input,
      agentId
    })
  ]
}

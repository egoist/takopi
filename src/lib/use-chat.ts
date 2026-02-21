import { generateId } from "ai"
import type { UIMessagePart } from "ai"
import { createParser } from "eventsource-parser"
import { atom, getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai"
import { useMemo } from "react"
import {
  type UserAttachmentPart,
  createSpecialUserMessage,
  createUserMessage,
  getDisplayedMessages
} from "./chat"
import type { Chat, ChatMessage } from "@/types/chat"
import type { CustomUIMessagePart, ToolConfirmation, UserQuestionRequest } from "./types"

type ChatStateType = {
  input?: string
  generatingMessageId?: string
  error?: Error
  toolConfirmations?: ToolConfirmation[]
  userQuestions?: UserQuestionRequest[]
  draftAttachments?: UserAttachmentPart[]
}

const chatStatesAtom = atom<{
  [chatId: string]: ChatStateType
}>({})

export const useChatState = (chatId: string) => {
  const chatStates = useAtomValue(chatStatesAtom)
  return chatStates[chatId] || {}
}

const abortControllers: { [chatId: string]: AbortController | undefined } = {}

export type SetMessages = (
  updater: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[])
) => void

export type SetChat = (updater: Chat | ((chat: Chat) => Chat)) => void

export const setChatState = (
  chatId: string,
  state: ChatStateType | ((prev: ChatStateType) => ChatStateType)
) => {
  const store = getDefaultStore()
  store.set(chatStatesAtom, (prev) => ({
    ...prev,
    [chatId]:
      typeof state === "function"
        ? state(prev[chatId] || {})
        : {
            ...prev[chatId],
            ...state
          }
  }))
}

export const useChat = ({
  chatId,
  messages,
  setMessages,
  setChat,
  endpoint = "/api/chat",
  agentId
}: {
  chatId: string
  messages: ChatMessage[]
  setMessages: SetMessages
  setChat: SetChat
  endpoint?: string
  agentId: string
}) => {
  const chatStates = useAtomValue(chatStatesAtom)
  const chatState = useMemo(() => chatStates[chatId] || {}, [chatStates, chatId])

  const stop = () => {
    abortControllers[chatId]?.abort()
    abortControllers[chatId] = undefined

    setChatState(chatId, (prev) => ({
      ...prev,
      generatingMessageId: undefined,
      toolConfirmations: undefined,
      userQuestions: undefined
    }))

    fetch("/api/cancel-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: chatId })
    })
  }

  const answerQuestion = async (
    toolCallId: string,
    answers: Array<{ question: string; selectedOptions: string[]; customAnswer?: string }>
  ) => {
    // Remove question UI immediately
    setChatState(chatId, (prev) => ({
      ...prev,
      userQuestions: (prev.userQuestions || []).filter((q) => q.toolCallId !== toolCallId)
    }))

    await fetch("/api/answer-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, toolCallId, answers })
    })
  }

  const confirmTool = async (toolCallId: string, approved: boolean) => {
    // Remove confirmation UI immediately
    setChatState(chatId, (prev) => ({
      ...prev,
      toolConfirmations: (prev.toolConfirmations || []).filter((c) => c.toolCallId !== toolCallId)
    }))

    await fetch("/api/confirm-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, toolCallId, approved })
    })
  }

  const handleStream = async (response: Response, messageId: string) => {
    let parts: CustomUIMessagePart[] = []
    const parser = createParser({
      onEvent: (event) => {
        if (event.event === "part") {
          const { index, part } = JSON.parse(event.data)
          parts[index] = part

          setMessages((prev) => {
            return prev.map((m) => {
              if (m.id === messageId) {
                return {
                  ...m,
                  content: [...parts]
                }
              }
              return m
            })
          })
        } else if (event.event === "metadata") {
          const metadata = JSON.parse(event.data)
          setMessages((prev) => {
            return prev.map((m) => {
              if (m.id === messageId) {
                return {
                  ...m,
                  metadata
                }
              }
              return m
            })
          })
        } else if (event.event === "title") {
          const title = event.data
          setChat((prev) => ({
            ...prev,
            title
          }))
        } else if (event.event === "tool-confirmation") {
          const confirmation: ToolConfirmation = JSON.parse(event.data)
          if (confirmation.status === "pending") {
            setChatState(chatId, (prev) => ({
              ...prev,
              toolConfirmations: [
                ...(prev.toolConfirmations || []).filter(
                  (c) => c.toolCallId !== confirmation.toolCallId
                ),
                confirmation
              ]
            }))
          } else {
            // approved or rejected: remove from the list
            setChatState(chatId, (prev) => ({
              ...prev,
              toolConfirmations: (prev.toolConfirmations || []).filter(
                (c) => c.toolCallId !== confirmation.toolCallId
              )
            }))
          }
        } else if (event.event === "user-question") {
          const question: UserQuestionRequest = JSON.parse(event.data)
          if (question.status === "pending") {
            setChatState(chatId, (prev) => ({
              ...prev,
              userQuestions: [
                ...(prev.userQuestions || []).filter((q) => q.toolCallId !== question.toolCallId),
                question
              ]
            }))
          } else {
            // answered or timeout: remove from the list
            setChatState(chatId, (prev) => ({
              ...prev,
              userQuestions: (prev.userQuestions || []).filter(
                (q) => q.toolCallId !== question.toolCallId
              )
            }))
          }
        } else if (event.event === "error") {
          console.log("chat completed with error:", event.data)
          setChatState(chatId, (prev) => ({ ...prev, error: new Error(event.data) }))
        }
      }
    })

    const reader = response.body?.getReader()

    if (!reader) return

    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value))
    }

    setChatState(chatId, (prev) => ({
      ...prev,
      generatingMessageId: undefined,
      toolConfirmations: undefined,
      userQuestions: undefined
    }))
  }

  const sendMessages = async ({
    messages: overrideMessages,
    userMessageId
  }: {
    messages?: ChatMessage[]
    userMessageId?: string
  } = {}) => {
    console.log("sending", messages)
    const abortController = (abortControllers[chatId] = new AbortController())

    const assistantMessageId = generateId()

    const requestMessages: ChatMessage[] = [...(overrideMessages || messages)]
    const { displayedMessages } = getDisplayedMessages(requestMessages)

    let userMessage: ChatMessage | undefined

    if (userMessageId) {
      userMessage = requestMessages.find((m) => m.id === userMessageId)
    } else {
      userMessage = displayedMessages[displayedMessages.length - 1]
    }

    if (!userMessage || userMessage.role !== "user") {
      throw new Error("Last message must be from the user")
    }

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      createdAt: Date.now(),
      content: [],
      metadata: {},
      nextMessageIds: [],
      agent: agentId
    }
    userMessage.nextMessageId = assistantMessageId
    userMessage.nextMessageIds!.push(assistantMessageId)

    requestMessages.push(assistantMessage)

    setChat((prev) => ({
      ...prev,
      lastReplyAt: Date.now()
    }))

    setMessages(() => {
      return requestMessages
    })

    setChatState(chatId, (prev) => ({
      ...prev,
      error: undefined,
      generatingMessageId: assistantMessageId
    }))

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: abortController.signal,
        body: JSON.stringify({
          chatId,
          messages: requestMessages,
          agentId
        })
      })

      if (!response.ok) {
        const text = await response.text()
        let message = text
        try {
          const json = JSON.parse(text)
          if (json.error) message = json.error
        } catch {
          // not JSON, use raw text
        }
        throw new Error(message)
      }

      await handleStream(response, assistantMessageId)
    } catch (error) {
      setChatState(chatId, (prev) => ({
        ...prev,
        generatingMessageId: undefined,
        error: abortController.signal.aborted
          ? undefined
          : error instanceof Error
            ? error
            : new Error(String(error))
      }))
    }
  }

  const createAndSendMessage = ({
    id,
    input,
    attachments = []
  }: {
    id: string
    input: string
    attachments?: UserAttachmentPart[]
  }) => {
    const { displayedMessages } = getDisplayedMessages(messages)

    const lastDisplayMessage = displayedMessages[displayedMessages.length - 1]

    const userMessage = createUserMessage({
      id,
      input,
      attachments,
      agentId
    })

    const newMessages: ChatMessage[] = lastDisplayMessage
      ? [
          ...messages.map((m) => {
            if (m.id === lastDisplayMessage.id) {
              return {
                ...m,
                nextMessageId: id,
                nextMessageIds: [...(m.nextMessageIds || []), id]
              }
            }
            return m
          }),
          userMessage
        ]
      : [
          createSpecialUserMessage({
            agentId,
            userMessageId: userMessage.id
          }),
          userMessage
        ]

    sendMessages({
      messages: newMessages
    })
  }

  const resumeStream = async (assistantMessageId: string) => {
    const isGenerating = chatState.generatingMessageId
    if (isGenerating) return

    const abortController = (abortControllers[chatId] = new AbortController())
    try {
      const res = await fetch(`/api/resume-chat?${new URLSearchParams({ id: chatId })}`, {
        signal: abortController.signal
      })
      if (res.ok && res.headers.get("Content-Type")?.includes("text/event-stream")) {
        setChatState(chatId, (prev) => ({
          ...prev,
          generatingMessageId: assistantMessageId
        }))
        await handleStream(res, assistantMessageId)
      }
    } catch (error) {
      setChatState(chatId, (prev) => ({
        ...prev,
        generatingMessageId: undefined,
        error: abortController.signal.aborted
          ? undefined
          : error instanceof Error
            ? error
            : new Error(String(error))
      }))
    }
  }

  const editAndSendMessage = ({
    editedUserMessageId,
    id,
    input,
    attachments = []
  }: {
    editedUserMessageId: string
    id: string
    input: string
    attachments?: UserAttachmentPart[]
  }) => {
    // Find the message whose nextMessageId points to the edited user message
    const prevMessage = messages.find((m) => m.nextMessageId === editedUserMessageId)

    if (!prevMessage) return

    const userMessage = createUserMessage({ id, input, attachments, agentId })

    // Update the parent message to point to the new user message, adding it as a branch
    const newMessages = messages.map((m) => {
      if (m.id === prevMessage.id) {
        return {
          ...m,
          nextMessageId: id,
          nextMessageIds: [...(m.nextMessageIds || []), id]
        }
      }
      return m
    })

    newMessages.push(userMessage)

    sendMessages({ messages: newMessages })
  }

  const regenerate = ({ messageId }: { messageId?: string } = {}) => {
    const { displayedMessages } = getDisplayedMessages(messages)
    let userMessageId: string | undefined

    if (!messageId) {
      // No messageId: find the last user message in the displayed chain
      for (let i = displayedMessages.length - 1; i >= 0; i--) {
        const m = displayedMessages[i]
        if (m.role === "user") {
          userMessageId = m.id
          break
        }
      }
    } else {
      // messageId given (the assistant message id): find the user message
      // whose nextMessageId points to this assistant message
      for (const m of displayedMessages) {
        if (m.nextMessageId === messageId) {
          userMessageId = m.id
          break
        }
      }
    }

    if (!userMessageId) return

    sendMessages({ userMessageId })
  }

  return {
    chatState,
    setChatState,
    stop,
    confirmTool,
    answerQuestion,
    sendMessages,
    createAndSendMessage,
    editAndSendMessage,
    resumeStream,
    regenerate
  }
}

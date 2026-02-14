import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router"
import { generateId } from "ai"
import { rpc } from "@/lib/rpc-client"
import { MessageBlock } from "./message-block"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useChat, type SetChat, type SetMessages } from "@/lib/use-chat"
import { ToolConfirmation } from "./tool-confirmation"
import { UserQuestion } from "./user-question"
import { getChatDefault, getDisplayedMessages, getInitialMessages } from "@/lib/chat"
import { useChatQuery, useConfigQuery, useMessagesQuery } from "@/lib/queries"
import { SendBox } from "./send-box"

let newChatId = generateId()
let AUTO_SUBMIT = false

export function ChatUI() {
  const params = useParams()
  const navigate = useNavigate()
  const initialChatId = params.chatId
  const chatId = initialChatId || newChatId

  const [input, setInput] = useState("")
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const { data: config } = useConfigQuery()

  const chatQuery = useChatQuery(chatId)

  const defaultAgentId = config?.defaultAgent || ""
  const currentAgentId = chatQuery.data?.agent || defaultAgentId

  const messagesQuery = useMessagesQuery(chatId)

  const setMessages: SetMessages = (updater) => {
    queryClient.setQueryData(
      rpc.chat.getMessages.queryKey({
        input: {
          chatId
        }
      }),
      (prev) => {
        if (typeof updater === "function") {
          const result = updater(prev || [])

          return result
        }

        return updater
      },
      {}
    )
  }

  const setChat: SetChat = (updater) => {
    queryClient.setQueryData(rpc.chat.getChat.queryKey({ input: { chatId } }), (prev) => {
      if (!prev) return prev

      const updated = typeof updater === "function" ? { ...prev, ...updater(prev) } : updater

      // Also update the chats list query so the sidebar reflects changes (e.g. title)
      queryClient.setQueryData(rpc.chat.getChats.queryKey(), (chats) => {
        if (!chats) return chats
        return chats.map((c) => (c.id === chatId ? { ...c, ...updated } : c))
      })

      return updated
    })
  }

  const messages = messagesQuery.data || []

  const { displayedMessages, firstMessage, messagesMap } = getDisplayedMessages(messages)

  const {
    chatState,
    sendMessages,
    createAndSendMessage,
    editAndSendMessage,
    resumeStream,
    confirmTool,
    answerQuestion,
    regenerate,
    stop
  } = useChat({
    chatId: chatId!,
    messages,
    setMessages,
    setChat,
    agentId: currentAgentId,
    endpoint: "/api/chat"
  })

  // Auto-submit after navigation to new chat
  useEffect(() => {
    if (AUTO_SUBMIT && chatQuery.data && chatQuery.isSuccess) {
      AUTO_SUBMIT = false
      // Rotate the newChatId so next homepage visit gets a fresh ID
      newChatId = generateId()
      sendMessages()
    }
  }, [chatQuery.data, chatQuery.isSuccess])

  // Resume stream if last message is from assistant
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === "assistant") {
      resumeStream(lastMessage.id)
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || chatState.generatingMessageId) return

    const content = input.trim()
    setInput("")

    // If on homepage (no initialChatId), create default chat and navigate
    if (!initialChatId) {
      const newChat = getChatDefault({
        chatId,
        agentId: currentAgentId
      })
      const initialMessages = getInitialMessages({
        input: content,
        agentId: currentAgentId
      })

      queryClient.setQueryData(
        rpc.chat.getChat.queryKey({
          input: { chatId }
        }),
        () => newChat
      )

      queryClient.setQueryData(rpc.chat.getChats.queryKey(), (prev) => {
        return [...(prev || []), newChat]
      })

      queryClient.setQueryData(
        rpc.chat.getMessages.queryKey({
          input: { chatId }
        }),
        () => initialMessages
      )

      AUTO_SUBMIT = true

      navigate(`/chat/${chatId}`)
      return
    }

    // If editing an existing message, create a new branch
    if (editingMessageId) {
      const userMessageId = generateId()
      editAndSendMessage({
        editedUserMessageId: editingMessageId,
        id: userMessageId,
        input: content
      })
      setEditingMessageId(null)
      return
    }

    // Otherwise send directly
    const userMessageId = generateId()
    createAndSendMessage({
      id: userMessageId,
      input: content
    })
  }

  const handleEditMessage = (messageId: string, text: string) => {
    setEditingMessageId(messageId)
    setInput(text)
    textareaRef.current?.focus()
  }

  const cancelEditing = () => {
    setEditingMessageId(null)
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
    if (e.key === "Escape" && editingMessageId) {
      cancelEditing()
    }
  }

  const isLoading = Boolean(chatState.generatingMessageId)

  const chatTitle = chatQuery.data?.title || "New Chat"

  return (
    <div className="flex flex-col h-dvh">
      <header className="h-10 flex items-center border-b app-drag-region px-4 shrink-0">
        <span className="text-sm font-medium">{chatTitle}</span>
      </header>
      <div className="grow overflow-auto p-4">
        {displayedMessages.map((message, index) => {
          const prevMessage = displayedMessages[index - 1]
          const alternativeMessages = (
            index === 0 ? firstMessage?.nextMessageIds || [] : prevMessage?.nextMessageIds || []
          )
            .map((id) => messagesMap.get(id))
            .filter((v) => v !== undefined)

          return (
            <MessageBlock
              key={message.id}
              chatId={chatId}
              message={message}
              isGenerating={isLoading && chatState.generatingMessageId === message.id}
              regenerate={regenerate}
              onEdit={handleEditMessage}
              alternativeMessages={alternativeMessages}
              prevMessageId={prevMessage?.id || firstMessage?.id}
            />
          )
        })}
        {chatState.toolConfirmations?.map((confirmation) => (
          <ToolConfirmation
            key={confirmation.toolCallId}
            confirmation={confirmation}
            onConfirm={confirmTool}
          />
        ))}
        {chatState.userQuestions?.map((question) => (
          <UserQuestion key={question.toolCallId} request={question} onAnswer={answerQuestion} />
        ))}
        {chatState.error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            {chatState.error.message || "An error occurred"}
          </div>
        )}
      </div>
      <div className="shrink-0 p-2">
        <SendBox
          input={input}
          setInput={setInput}
          textareaRef={textareaRef}
          editingMessageId={editingMessageId}
          isLoading={isLoading}
          agentId={currentAgentId || undefined}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          onCancelEditing={cancelEditing}
          onStop={stop}
        />
      </div>
    </div>
  )
}

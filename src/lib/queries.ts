import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { rpc, rpcClient } from "./rpc-client"
import type { ChatMessage } from "@/types/chat"
import type { Config } from "@/types/config"

export const useConfigQuery = () => {
  return useQuery(rpc.config.getConfig.queryOptions())
}

export const useUpdateConfigMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: Partial<Config>) => {
      return await rpcClient.config.updateConfig(config)
    },
    onMutate: (variables) => {
      queryClient.setQueryData(rpc.config.getConfig.queryKey(), (prev) => {
        if (!prev) return prev

        return {
          ...prev,
          ...variables
        }
      })
    }
  })
}

export const useChatQuery = (chatId: string | undefined) => {
  return useQuery(
    rpc.chat.getChat.queryOptions({
      input: {
        chatId: chatId!
      },
      enabled: Boolean(chatId)
    })
  )
}

export const useChatsQuery = () => {
  return useQuery(rpc.chat.getChats.queryOptions())
}

export const useMessagesQuery = (chatId: string) => {
  return useQuery(
    rpc.chat.getMessages.queryOptions({
      input: {
        chatId
      }
    })
  )
}

export const useUpdateNextMessageIdMutation = (chatId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { chatId: string; messageId: string; nextMessageId: string }) => {
      return await rpcClient.chat.updateNextMessageId(input)
    },
    onMutate: (variables) => {
      queryClient.setQueryData(
        rpc.chat.getMessages.queryKey({ input: { chatId } }),
        (prev: ChatMessage[] | undefined) => {
          if (!prev) return prev

          return prev.map((m) => {
            if (m.id === variables.messageId) {
              return {
                ...m,
                nextMessageId: variables.nextMessageId
              }
            }
            return m
          })
        }
      )
    }
  })
}

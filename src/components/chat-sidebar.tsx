import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { Settings, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { rpc, rpcClient } from "@/lib/rpc-client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import { InputDialog } from "@/components/input-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import type { Chat } from "@/types/chat"
import { cn } from "@/lib/utils"
import { useChatsQuery } from "@/lib/queries"
import TakopiIcon from "./takopi-icon"

interface ChatSidebarProps {
  activeChatId?: string
}

function ChatSidebarItem({
  chat,
  isActive,
  onRename,
  onDelete
}: {
  chat: Chat
  isActive: boolean
  onRename: (chat: Chat) => void
  onDelete: (chat: Chat) => void
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  return (
    <Link
      to={`/chat/${chat.id}`}
      className={`group relative flex items-center justify-between px-3 h-8 rounded-md text-sm transition-colors ${
        isActive ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/50"
      }`}
      data-dropdown={showDropdown}
    >
      <span className="truncate grow">{chat.title}</span>
      <span
        className={cn(
          "flex items-center gap-1 absolute top-0 bottom-0 right-0 pr-1 invisible group-hover:visible group-hover:bg-linear-to-l from-secondary from-60% to-transparent rounded-r-md pl-4 group-data-[dropdown=true]:visible group-data-[dropdown=true]:bg-linear-to-l"
        )}
      >
        <DropdownMenu
          open={showDropdown}
          onOpenChange={(open) => {
            setShowDropdown(open)
          }}
        >
          <DropdownMenuTrigger
            className="invisible flex shrink-0 h-6 w-6 items-center justify-center rounded-md hover:bg-zinc-200 aria-expanded:visible group-hover:visible"
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={4}
            onClick={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onClick={() => onRename(chat)}>
              <Pencil className="h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(chat)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </Link>
  )
}

export function ChatSidebar({ activeChatId }: ChatSidebarProps) {
  const { data: chats = [] } = useChatsQuery()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [renameChat, setRenameChat] = useState<Chat | null>(null)
  const [deleteChat, setDeleteChat] = useState<Chat | null>(null)

  const renameMutation = useMutation({
    mutationFn: (input: { chatId: string; title: string }) => rpcClient.chat.renameChat(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rpc.chat.getChats.queryKey() })
      setRenameChat(null)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (input: { chatId: string }) => rpcClient.chat.deleteChat(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: rpc.chat.getChats.queryKey() })
      queryClient.removeQueries({
        queryKey: rpc.chat.getMessages.queryKey({
          input: { chatId: variables.chatId }
        })
      })
      queryClient.removeQueries({
        queryKey: rpc.chat.getChat.queryKey({
          input: { chatId: variables.chatId }
        })
      })
      setDeleteChat(null)
      if (activeChatId === variables.chatId) {
        navigate("/")
      }
    }
  })

  const sortedChats = [...chats].sort((a, b) => {
    const aTime = new Date(a.lastReplyAt ?? a.updatedAt).getTime()
    const bTime = new Date(b.lastReplyAt ?? b.updatedAt).getTime()
    return bTime - aTime
  })

  return (
    <div className="w-64 border-r shrink-0 flex flex-col bg-background">
      {/* Header */}
      <div className="h-10 flex items-center justify-between border-b px-3 app-drag-region">
        <span className="text-sm font-medium inline-flex items-center gap-1">
          <TakopiIcon className="text-xl" />
          <span>takopi</span>
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (activeChatId) {
                const activeChat = chats.find((c) => c.id === activeChatId)
                if (activeChat) {
                  rpcClient.chat
                    .saveSessionMemory({
                      chatId: activeChatId,
                      agentId: activeChat.agent
                    })
                    .catch(() => {})
                }
              }
              navigate("/")
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-2">
        {sortedChats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No chats yet</div>
        ) : (
          <div className="space-y-1">
            {sortedChats.map((chat) => (
              <ChatSidebarItem
                key={chat.id}
                chat={chat}
                isActive={activeChatId === chat.id}
                onRename={setRenameChat}
                onDelete={setDeleteChat}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rename Dialog */}
      <InputDialog
        open={renameChat !== null}
        onOpenChange={(open) => {
          if (!open) setRenameChat(null)
        }}
        title="Rename Chat"
        description="Enter a new name for this chat."
        defaultValue={renameChat?.title ?? ""}
        placeholder="Chat name"
        submitLabel="Rename"
        loading={renameMutation.isPending}
        onSubmit={(title) => {
          if (renameChat) {
            renameMutation.mutate({ chatId: renameChat.id, title })
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteChat !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteChat(null)
        }}
        title="Delete Chat"
        description={`Are you sure you want to delete "${deleteChat?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteChat) {
            deleteMutation.mutate({ chatId: deleteChat.id })
          }
        }}
      />
    </div>
  )
}

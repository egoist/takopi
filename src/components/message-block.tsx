import type { ChatMessage } from "@/types/chat"
import type { ChatMessageFile } from "@/types/chat"
import type { CustomUIMessagePart } from "@/lib/types"
import { isStaticToolUIPart, isToolUIPart } from "ai"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Copy,
  RefreshCw,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  BarChart3,
  Paperclip
} from "lucide-react"
import { Loader } from "@cloudflare/kumo"
import { Markdown } from "./markdown"
import { ReasoningBlock } from "./reasoning-block"
import { ToolBlock } from "./tool-block"
import type { CustomUITools } from "@/server/lib/ai-tools"
import { useUpdateNextMessageIdMutation } from "@/lib/queries"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"

interface MessageBlockProps {
  chatId: string
  message: ChatMessage
  isGenerating?: boolean
  regenerate: (ctx?: { messageId?: string }) => void
  onEdit: (
    messageId: string,
    text: string,
    attachments: ChatMessageFile[]
  ) => void
  alternativeMessages: ChatMessage[]
  prevMessageId?: string
}

function getMessageText(msg: ChatMessage): string {
  if (!msg.content) return ""

  return msg.content
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("")
}

function mergeReasoningParts(
  content: CustomUIMessagePart[],
  durations?: Record<number, number>
): Array<{ part: CustomUIMessagePart; duration?: number }> {
  const result: Array<{ part: CustomUIMessagePart; duration?: number }> = []

  for (let i = 0; i < content.length; i++) {
    const part = content[i]
    if (part.type === "reasoning") {
      result.push({
        part,
        duration: durations?.[i]
      })
    } else {
      result.push({ part })
    }
  }

  return result
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6
  }).format(value)
}

function toRenderableFileUrl(value: string): string {
  if (value.startsWith("data:")) return value
  if (value.startsWith("http://") || value.startsWith("https://")) return value
  if (value.startsWith("file://")) {
    return `/api/attachment?path=${encodeURIComponent(value)}`
  }
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return `/api/attachment?path=${encodeURIComponent(value)}`
  }
  return value
}

export function MessageBlock({
  chatId,
  message,
  isGenerating,
  regenerate,
  onEdit,
  alternativeMessages,
  prevMessageId
}: MessageBlockProps) {
  const isUser = message.role === "user"
  const currentMessageIndex = alternativeMessages.findIndex((m) => m.id === message.id)
  const updateNextMessageIdMutation = useUpdateNextMessageIdMutation(chatId)

  return (
    <div
      className={cn(
        "group/message-block flex flex-col gap-2 mb-4",
        isUser ? "items-end" : "items-start"
      )}
    >
      {isUser ? (
        <UserMessage message={message} />
      ) : (
        <AssistantMessage message={message} isGenerating={isGenerating} />
      )}
      {isUser ? (
        <UserMessageActions
          message={message}
          chatId={chatId}
          onEdit={onEdit}
          currentMessageIndex={currentMessageIndex}
          alternativeMessages={alternativeMessages}
          prevMessageId={prevMessageId}
          updateNextMessageIdMutation={updateNextMessageIdMutation}
        />
      ) : (
        !isGenerating && (
          <AssistantMessageActions
            message={message}
            chatId={chatId}
            regenerate={regenerate}
            currentMessageIndex={currentMessageIndex}
            alternativeMessages={alternativeMessages}
            prevMessageId={prevMessageId}
            updateNextMessageIdMutation={updateNextMessageIdMutation}
          />
        )
      )}
    </div>
  )
}

const UserMessage = ({ message }: { message: ChatMessage }) => {
  const content = getMessageText(message)
  const attachments = message.files ?? []

  return (
    <div className="flex flex-col items-end max-w-[80%]">
      {content && (
        <div className="w-fit rounded-xl bg-zinc-100  p-2 px-3.5 break-all whitespace-break-spaces">
          {content}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {attachments.map((attachment, index) => {
            const isImage = attachment.mediaType.startsWith("image/")
            return (
              <a
                key={`${attachment.filename || "attachment"}-${index}`}
                href={toRenderableFileUrl(attachment.url)}
                download={attachment.filename}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-2 py-1 text-xs text-zinc-700"
              >
                {isImage ? (
                  <img
                    src={toRenderableFileUrl(attachment.url)}
                    alt={attachment.filename || "image attachment"}
                    className="size-10 rounded object-cover"
                  />
                ) : (
                  <Paperclip className="size-3.5 text-zinc-500" />
                )}
                <span className="max-w-[180px] truncate">
                  {attachment.filename || "attachment"}
                </span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

const AssistantMessage = ({
  message,
  isGenerating
}: {
  message: ChatMessage
  isGenerating?: boolean
}) => {
  const hasContent = message.content && message.content.length > 0
  const mergedContent = mergeReasoningParts(message.content, message.metadata?.reasoningDurations)

  return (
    <div className="flex flex-col gap-1 max-w-[80%]">
      <div className="flex flex-col gap-3 empty:hidden">
        {!hasContent && (
          <div>
            {isGenerating ? (
              <Loader size="base" />
            ) : (
              <div className="inline-flex items-center gap-2 rounded-lg text-zinc-500 italic">
                <span>No response generated</span>
              </div>
            )}
          </div>
        )}

        {mergedContent.map(({ part, duration }, index) => {
          if (part.type === "text" && part.text.trim()) {
            return (
              <div key={index} className="">
                <div className="prose">
                  <Markdown>{part.text.trim()}</Markdown>
                </div>
              </div>
            )
          }

          if (part.type === "reasoning" && part.text.trim()) {
            return <ReasoningBlock key={index} content={part.text} duration={duration || 0} />
          }

          if (isStaticToolUIPart(part) && isToolUIPart<CustomUITools>(part)) {
            return (
              <ToolBlock
                key={index}
                part={part}
                isLoading={
                  !!isGenerating &&
                  (part.state !== "output-available" || part.type === "tool-Task")
                }
              />
            )
          }

          return null
        })}
      </div>
    </div>
  )
}

const AlternativeMessageNav = ({
  chatId,
  currentMessageIndex,
  alternativeMessages,
  prevMessageId,
  updateNextMessageIdMutation
}: {
  chatId: string
  currentMessageIndex: number
  alternativeMessages: ChatMessage[]
  prevMessageId?: string
  updateNextMessageIdMutation: ReturnType<typeof useUpdateNextMessageIdMutation>
}) => {
  if (alternativeMessages.length <= 1 || !prevMessageId) return null

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={currentMessageIndex <= 0}
        className="inline-flex items-center p-0.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-30"
        onClick={() => {
          updateNextMessageIdMutation.mutate({
            chatId,
            messageId: prevMessageId,
            nextMessageId: alternativeMessages[currentMessageIndex - 1].id
          })
        }}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs text-zinc-500 tabular-nums">
        {currentMessageIndex + 1}/{alternativeMessages.length}
      </span>
      <button
        type="button"
        disabled={currentMessageIndex >= alternativeMessages.length - 1}
        className="inline-flex items-center p-0.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-30"
        onClick={() => {
          updateNextMessageIdMutation.mutate({
            chatId,
            messageId: prevMessageId,
            nextMessageId: alternativeMessages[currentMessageIndex + 1].id
          })
        }}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

const UserMessageActions = ({
  message,
  chatId,
  onEdit,
  currentMessageIndex,
  alternativeMessages,
  prevMessageId,
  updateNextMessageIdMutation
}: {
  message: ChatMessage
  chatId: string
  onEdit: (
    messageId: string,
    text: string,
    attachments: ChatMessageFile[]
  ) => void
  currentMessageIndex: number
  alternativeMessages: ChatMessage[]
  prevMessageId?: string
  updateNextMessageIdMutation: ReturnType<typeof useUpdateNextMessageIdMutation>
}) => {
  const [copied, setCopied] = useState(false)
  const content = getMessageText(message)
  const hasContent = content.length > 0
  const attachments = message.files ?? []
  const hasEditableContent = hasContent || attachments.length > 0

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover/message-block:opacity-100 transition-opacity justify-end">
      {hasEditableContent && (
        <button
          onClick={() => onEdit(message.id, content, attachments)}
          className="inline-flex items-center p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}
      {hasContent && (
        <>
          <button
            onClick={handleCopy}
            className="inline-flex items-center p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
            title="Copy"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </>
      )}

      <AlternativeMessageNav
        chatId={chatId}
        currentMessageIndex={currentMessageIndex}
        alternativeMessages={alternativeMessages}
        prevMessageId={prevMessageId}
        updateNextMessageIdMutation={updateNextMessageIdMutation}
      />
    </div>
  )
}

const AssistantMessageActions = ({
  message,
  chatId,
  regenerate,
  currentMessageIndex,
  alternativeMessages,
  prevMessageId,
  updateNextMessageIdMutation
}: {
  message: ChatMessage
  chatId: string
  regenerate: (ctx?: { messageId?: string }) => void
  currentMessageIndex: number
  alternativeMessages: ChatMessage[]
  prevMessageId?: string
  updateNextMessageIdMutation: ReturnType<typeof useUpdateNextMessageIdMutation>
}) => {
  const [copied, setCopied] = useState(false)
  const content = getMessageText(message)
  const hasContent = content.length > 0

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover/message-block:opacity-100 transition-opacity justify-start">
      {hasContent && (
        <button
          onClick={handleCopy}
          className="inline-flex items-center p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
          title="Copy"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      )}

      <button
        type="button"
        onClick={() => regenerate({ messageId: message.id })}
        className="inline-flex items-center p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
        title="Regenerate"
      >
        <RefreshCw className="w-4 h-4" />
      </button>

      <AssistantUsagePopover message={message} />

      <AlternativeMessageNav
        chatId={chatId}
        currentMessageIndex={currentMessageIndex}
        alternativeMessages={alternativeMessages}
        prevMessageId={prevMessageId}
        updateNextMessageIdMutation={updateNextMessageIdMutation}
      />
    </div>
  )
}

const AssistantUsagePopover = ({ message }: { message: ChatMessage }) => {
  const metadata = message.metadata
  if (!metadata) return null
  const taskTotalCost = Object.values(metadata.taskUsages ?? {}).reduce((sum, usage) => {
    return sum + usage.totalCost
  }, 0)
  const combinedTotalCost = (metadata.mainUsage?.totalCost ?? 0) + taskTotalCost

  const hasStats =
    metadata.timeToFirstToken != null ||
    metadata.duration != null ||
    metadata.mainUsage?.inputTokens != null ||
    metadata.mainUsage?.outputTokens != null ||
    metadata.mainUsage?.outputImagesCost != null ||
    metadata.mainUsage?.totalCost != null ||
    taskTotalCost > 0

  if (!hasStats) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
            title="Usage"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        }
      />
      <PopoverContent className="w-64">
        <div className="flex flex-col gap-2 text-sm">
          {metadata.timeToFirstToken != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-600">Time to first token</span>
              <span className="text-zinc-500">{formatDuration(metadata.timeToFirstToken)}</span>
            </div>
          )}
          {metadata.duration != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-600">Total duration</span>
              <span className="text-zinc-500">{formatDuration(metadata.duration)}</span>
            </div>
          )}
          {metadata.mainUsage?.inputTokens != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-600">Input tokens</span>
              <span className="text-zinc-500">{formatNumber(metadata.mainUsage.inputTokens)}</span>
            </div>
          )}
          {metadata.mainUsage?.outputTokens != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-600">Output tokens</span>
              <span className="text-zinc-500">
                {formatNumber(metadata.mainUsage.outputTokens)}
              </span>
            </div>
          )}
          {metadata.mainUsage?.outputImagesCost != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-600">Output images cost</span>
              <span className="text-zinc-500">
                {formatUSD(metadata.mainUsage.outputImagesCost)}
              </span>
            </div>
          )}
          {combinedTotalCost > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-600">Total cost</span>
              <span className="text-zinc-500">{formatUSD(combinedTotalCost)}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

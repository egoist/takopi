import { ChatToolExpand } from "@/components/chat-tool-expand"

interface ReasoningBlockProps {
  content: string
  duration: number
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ReasoningBlock({ content, duration }: ReasoningBlockProps) {
  return (
    <ChatToolExpand
      label={
        <span className="font-medium">
          {duration > 0 ? `Thought for ${formatDuration(duration)}` : "Thinking..."}
        </span>
      }
    >
      <div className="mt-2 rounded-md border p-3 text-sm break-after-all">{content}</div>
    </ChatToolExpand>
  )
}

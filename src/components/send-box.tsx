import { useState, useRef, useCallback } from "react"
import { ArrowUp, Square, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "./ui/button"
import { AgentSelect } from "./agent-select"
import { MentionPopover } from "./mention-popover"
import { SlashCommandPopover } from "./slash-command-popover"
import { rpc } from "@/lib/rpc-client"

type SendBoxProps = {
  input: string
  setInput: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  editingMessageId: string | null
  isLoading: boolean
  agentId?: string
  onSubmit: (e: React.FormEvent) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCancelEditing: () => void
  onStop: () => void
}

function detectMention(textarea: HTMLTextAreaElement) {
  const pos = textarea.selectionStart
  const textBefore = textarea.value.slice(0, pos)
  const match = textBefore.match(/(^|\s)@(\w+)$/)
  if (match) {
    const query = match[2]
    const start = pos - query.length - 1 // include the @
    return { query, start, end: pos }
  }
  return null
}

function detectSlashCommand(textarea: HTMLTextAreaElement) {
  const pos = textarea.selectionStart
  const textBefore = textarea.value.slice(0, pos)
  const match = textBefore.match(/(^|\s)\/(\w*)$/)
  if (match) {
    const query = match[2]
    const start = pos - query.length - 1 // include the /
    return { query, start, end: pos }
  }
  return null
}

export function SendBox({
  input,
  setInput,
  textareaRef,
  editingMessageId,
  isLoading,
  agentId,
  onSubmit,
  onKeyDown,
  onCancelEditing,
  onStop,
}: SendBoxProps) {
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionHighlightedIndex, setMentionHighlightedIndex] = useState(0)
  const mentionRange = useRef<{ start: number; end: number } | null>(null)

  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState("")
  const [slashHighlightedIndex, setSlashHighlightedIndex] = useState(0)
  const slashRange = useRef<{ start: number; end: number } | null>(null)

  const { data: workspaceFiles = [] } = useQuery({
    ...rpc.chat.searchWorkspaceFiles.queryOptions({
      input: { agentId: agentId!, query: mentionQuery },
    }),
    enabled: mentionOpen && !!agentId,
  })

  const { data: skills = [] } = useQuery({
    ...rpc.chat.listSkills.queryOptions({
      input: { query: slashQuery || undefined },
    }),
    enabled: slashOpen,
  })

  const updateMention = useCallback((textarea: HTMLTextAreaElement) => {
    const result = detectMention(textarea)
    if (result) {
      setMentionOpen(true)
      setMentionQuery(result.query)
      setMentionHighlightedIndex(0)
      mentionRange.current = { start: result.start, end: result.end }
    } else {
      setMentionOpen(false)
      mentionRange.current = null
    }
  }, [])

  const updateSlashCommand = useCallback((textarea: HTMLTextAreaElement) => {
    const result = detectSlashCommand(textarea)
    if (result) {
      setSlashOpen(true)
      setSlashQuery(result.query)
      setSlashHighlightedIndex(0)
      slashRange.current = { start: result.start, end: result.end }
    } else {
      setSlashOpen(false)
      slashRange.current = null
    }
  }, [])

  const handleMentionSelect = useCallback(
    (filePath: string) => {
      const textarea = textareaRef.current
      const range = mentionRange.current
      if (!textarea || !range) return

      const before = input.slice(0, range.start)
      const after = input.slice(range.end)
      const inserted = `@${filePath} `
      const newValue = before + inserted + after
      setInput(newValue)

      setMentionOpen(false)
      mentionRange.current = null

      // Restore cursor after the inserted text
      const cursorPos = before.length + inserted.length
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(cursorPos, cursorPos)
      })
    },
    [input, setInput, textareaRef]
  )

  const handleSlashSelect = useCallback(
    (skillName: string) => {
      const textarea = textareaRef.current
      const range = slashRange.current
      if (!textarea || !range) return

      const before = input.slice(0, range.start)
      const after = input.slice(range.end)
      const inserted = `/${skillName} `
      const newValue = before + inserted + after
      setInput(newValue)

      setSlashOpen(false)
      slashRange.current = null

      const cursorPos = before.length + inserted.length
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(cursorPos, cursorPos)
      })
    },
    [input, setInput, textareaRef]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    updateMention(e.target)
    updateSlashCommand(e.target)
  }

  const handleSelect = () => {
    if (textareaRef.current) {
      updateMention(textareaRef.current)
      updateSlashCommand(textareaRef.current)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash command popover keyboard navigation
    if (slashOpen && skills.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSlashHighlightedIndex((prev) =>
            prev < skills.length - 1 ? prev + 1 : prev
          )
          return
        case "ArrowUp":
          e.preventDefault()
          setSlashHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          return
        case "Enter":
        case "Tab":
          e.preventDefault()
          handleSlashSelect(skills[slashHighlightedIndex].name)
          return
      }
    }

    if (slashOpen && e.key === "Escape") {
      e.preventDefault()
      setSlashOpen(false)
      slashRange.current = null
      return
    }

    // Handle mention popover keyboard navigation
    if (mentionOpen && workspaceFiles.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setMentionHighlightedIndex((prev) =>
            prev < workspaceFiles.length - 1 ? prev + 1 : prev
          )
          return
        case "ArrowUp":
          e.preventDefault()
          setMentionHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          return
        case "Enter":
        case "Tab":
          e.preventDefault()
          handleMentionSelect(workspaceFiles[mentionHighlightedIndex].path)
          return
      }
    }

    if (mentionOpen && e.key === "Escape") {
      e.preventDefault()
      setMentionOpen(false)
      mentionRange.current = null
      return
    }

    onKeyDown(e)
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="border rounded-md">
        {editingMessageId && (
          <div className="flex items-center justify-between border-b px-3 py-1.5 text-sm text-zinc-500">
            <span>Editing message</span>
            <button
              type="button"
              onClick={onCancelEditing}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-red-500 hover:bg-red-100"
            >
              <span>Cancel</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="outline-none resize-none p-2 w-full"
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          rows={3}
          value={input}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <AgentSelect />
          <div>
            {isLoading ? (
              <Button
                type="button"
                size="icon-sm"
                variant="destructive"
                onClick={onStop}
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" disabled={!input.trim()}>
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <MentionPopover
        open={mentionOpen && workspaceFiles.length > 0}
        files={workspaceFiles}
        textareaRef={textareaRef}
        highlightedIndex={mentionHighlightedIndex}
        onHighlightChange={setMentionHighlightedIndex}
        onSelect={handleMentionSelect}
      />
      <SlashCommandPopover
        open={slashOpen && skills.length > 0}
        skills={skills}
        textareaRef={textareaRef}
        highlightedIndex={slashHighlightedIndex}
        onHighlightChange={setSlashHighlightedIndex}
        onSelect={handleSlashSelect}
      />
    </form>
  )
}

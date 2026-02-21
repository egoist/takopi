import { useState, useRef, useCallback } from "react"
import { ArrowUp, Paperclip, Square, X } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "./ui/button"
import { AgentSelect } from "./agent-select"
import { MentionPopover } from "./mention-popover"
import { SlashCommandPopover } from "./slash-command-popover"
import { rpc } from "@/lib/rpc-client"
import type { UserAttachmentPart } from "@/lib/chat"
import { setChatState, useChatState } from "@/lib/use-chat"

type SendBoxProps = {
  chatId: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  editingMessageId: string | null
  isLoading: boolean
  agentId?: string
  onSubmit: (e: React.FormEvent, attachments: UserAttachmentPart[]) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCancelEditing: () => void
  onStop: () => void
}

const toRenderableFileUrl = (value: string) => {
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
  chatId,
  textareaRef,
  editingMessageId,
  isLoading,
  agentId,
  onSubmit,
  onKeyDown,
  onCancelEditing,
  onStop
}: SendBoxProps) {
  const chatState = useChatState(chatId)

  const input = chatState.input || ""
  const setInput = (value: string) => {
    setChatState(chatId, (prev) => {
      return {
        ...prev,
        input: value
      }
    })
  }

  const attachments = chatState.draftAttachments || []
  const setAttachments = (updater: React.SetStateAction<UserAttachmentPart[]>) => {
    setChatState(chatId, (prev) => {
      return {
        ...prev,
        draftAttachments:
          typeof updater === "function" ? updater(prev.draftAttachments || []) : updater
      }
    })
  }

  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionHighlightedIndex, setMentionHighlightedIndex] = useState(0)
  const mentionRange = useRef<{ start: number; end: number } | null>(null)

  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState("")
  const [slashHighlightedIndex, setSlashHighlightedIndex] = useState(0)
  const slashRange = useRef<{ start: number; end: number } | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: workspaceFiles = [] } = useQuery({
    ...rpc.chat.searchWorkspaceFiles.queryOptions({
      input: { agentId: agentId!, query: mentionQuery }
    }),
    enabled: mentionOpen && !!agentId
  })

  const { data: skills = [] } = useQuery({
    ...rpc.chat.listSkills.queryOptions({
      input: { query: slashQuery || undefined }
    }),
    enabled: slashOpen
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
          setSlashHighlightedIndex((prev) => (prev < skills.length - 1 ? prev + 1 : prev))
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
          setMentionHighlightedIndex((prev) => (prev < workspaceFiles.length - 1 ? prev + 1 : prev))
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

  const addAttachments = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return

      setIsUploadingAttachments(true)
      setUploadError(null)

      const uploaded = await Promise.allSettled(
        Array.from(fileList).map(async (file) => {
          const formData = new FormData()
          formData.append("file", file)

          const response = await fetch("/api/upload-attachment", {
            method: "POST",
            body: formData
          })

          if (!response.ok) {
            const text = await response.text()
            throw new Error(text || `Failed to upload ${file.name}`)
          }

          const payload = (await response.json()) as {
            path: string
            mediaType: string
            filename: string
          }

          return {
            type: "file" as const,
            mediaType: payload.mediaType || file.type || "application/octet-stream",
            filename: payload.filename || file.name,
            url: payload.path
          }
        })
      )
      setIsUploadingAttachments(false)

      const nextParts: UserAttachmentPart[] = []
      let failedCount = 0
      for (const result of uploaded) {
        if (result.status === "fulfilled") {
          nextParts.push(result.value)
        } else {
          failedCount += 1
        }
      }
      if (failedCount > 0) {
        setUploadError(
          failedCount === 1
            ? "One attachment failed to upload."
            : `${failedCount} attachments failed to upload.`
        )
      }

      setAttachments((prev) => {
        const deduped = new Set<string>(
          prev.map((part) => `${part.filename || "attachment"}-${part.mediaType}-${part.url}`)
        )
        const merged = [...prev]
        for (const part of nextParts) {
          const key = `${part.filename || "attachment"}-${part.mediaType}-${part.url}`
          if (!deduped.has(key)) {
            deduped.add(key)
            merged.push(part)
          }
        }
        return merged
      })
    },
    [setAttachments]
  )

  const handleAttachmentInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      await addAttachments(event.target.files)
      event.target.value = ""
    },
    [addAttachments]
  )

  const removeAttachment = useCallback(
    (index: number) => {
      setAttachments((prev) => prev.filter((_, attachmentIndex) => attachmentIndex !== index))
    },
    [setAttachments]
  )

  const canSubmit = !isUploadingAttachments && (input.trim().length > 0 || attachments.length > 0)

  return (
    <form onSubmit={(event) => onSubmit(event, attachments)}>
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
        {attachments.length > 0 && (
          <div className="px-2 pt-2 flex flex-wrap gap-2">
            {attachments.map((attachment, index) => {
              const isImage = attachment.mediaType.startsWith("image/")
              return (
                <div
                  key={`${attachment.filename || "attachment"}-${index}`}
                  className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                >
                  {isImage ? (
                    <img
                      src={toRenderableFileUrl(attachment.url)}
                      alt={attachment.filename || "image attachment"}
                      className="size-8 rounded object-cover"
                    />
                  ) : (
                    <Paperclip className="size-3.5 text-zinc-500" />
                  )}
                  <span className="max-w-[180px] truncate">
                    {attachment.filename || "attachment"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.filename || "attachment"}`}
                    onClick={() => removeAttachment(index)}
                    className="text-zinc-500 hover:text-zinc-900"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {uploadError && <div className="px-2 pb-1 text-xs text-destructive">{uploadError}</div>}
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
          <div className="flex items-center gap-1">
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleAttachmentInputChange}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={isLoading || isUploadingAttachments}
            >
              <Paperclip className="size-4" />
            </Button>
            {isLoading ? (
              <Button type="button" size="icon-sm" variant="destructive" onClick={onStop}>
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" disabled={!canSubmit}>
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

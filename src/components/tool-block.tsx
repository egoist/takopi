import { ChatToolExpand } from "@/components/chat-tool-expand"
import type { CustomToolUIPart } from "@/lib/types"

interface ToolBlockProps {
  part: CustomToolUIPart
  isLoading: boolean
}

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const getFaviconUrl = (domain: string) => `https://favicone.com/${domain}?size=32`

const LinkRow = ({
  url,
  title,
  favicon
}: {
  url: string
  title: string
  favicon?: string | null
}) => {
  const domain = getDomain(url)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center h-8 px-2 rounded-md hover:bg-zinc-100 gap-2 text-xs py-0.5 text-zinc-600 justify-between hover:text-zinc-900 transition-colors min-w-0"
    >
      <span className="truncate min-w-0 inline-flex items-center gap-2">
        <img src={favicon || getFaviconUrl(domain)} className="size-3" />
        <span>{title}</span>
      </span>
      <span className="text-zinc-400 shrink-0">{domain}</span>
    </a>
  )
}

const BashToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-Bash" }>
  isLoading: boolean
}) => {
  const command = part.input?.command
  const description = part.input?.description
  const output = part.output

  return (
    <ChatToolExpand
      isLoading={isLoading}
      label={
        <>
          {description && <span className="truncate">{description}</span>}
          {!description && command && (
            <span className="text-zinc-400 font-geist-mono truncate">{command}</span>
          )}
        </>
      }
    >
      {command && (
        <div className="mt-1.5 text-zinc-400 font-geist-mono text-xs overflow-hidden break-all line-clamp-1">
          {command}
        </div>
      )}
      {output && (
        <div className="mt-1.5 rounded-md border p-2 text-sm">
          <div>
            <pre className="mt-1 rounded text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </ChatToolExpand>
  )
}

const WebSearchToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-WebSearch" }>
  isLoading: boolean
}) => {
  const query = part.input?.query
  const results = (part.output ?? []) as Array<{
    title: string
    url: string
    score: number
    content: string
  }>

  return (
    <ChatToolExpand
      isLoading={isLoading}
      label={
        <>
          <span className="shrink-0">{isLoading ? "Searching " : "Searched "}</span>
          {query && <span className="font-medium truncate">{query}</span>}
        </>
      }
    >
      {results.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-0.5 border rounded-md p-2">
          {results.map((result, i) => (
            <LinkRow key={i} url={result.url} title={result.title} />
          ))}
        </div>
      )}
    </ChatToolExpand>
  )
}

const WebFetchToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-WebFetch" }>
  isLoading: boolean
}) => {
  const url = part.input?.url
  const result = part.output as
    | { title: string; content: string; favicon: string; published?: string }
    | undefined

  const domain = url ? getDomain(url) : null

  return (
    <ChatToolExpand
      isLoading={isLoading}
      label={
        <>
          <span className="shrink-0">{isLoading ? "Fetching" : "Fetched"} </span>
          {domain && (
            <span className="inline-flex items-center gap-1 truncate max-w-[300px]">
              {result?.favicon && <img src={result.favicon} className="size-3 shrink-0" />}
              {!result?.favicon && !isLoading && (
                <img src={getFaviconUrl(domain)} className="size-3 shrink-0" />
              )}
              <span className="font-medium truncate">{result?.title || domain}</span>
            </span>
          )}
        </>
      }
    >
      {result && url && (
        <div className="mt-1.5 border rounded-md p-2">
          <LinkRow url={url} title={result.title} favicon={result.favicon} />
        </div>
      )}
    </ChatToolExpand>
  )
}

const AskUserQuestionToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-AskUserQuestion" }>
  isLoading: boolean
}) => {
  const questions = part.input?.questions
  const output = part.output as
    | {
        type: "answered"
        answers: Array<{ question: string; selectedOptions: string[]; customAnswer?: string }>
      }
    | { type: "timeout"; message: string }
    | undefined

  return (
    <ChatToolExpand
      isLoading={isLoading}
      label={
        <>
          <span className="shrink-0">
            {isLoading
              ? "Asking question"
              : output?.type === "answered"
                ? "Asked question"
                : "Question timed out"}
          </span>
          {questions?.[0]?.header && (
            <span className="text-zinc-400 truncate ml-1">— {questions[0].header}</span>
          )}
        </>
      }
    >
      {questions && (
        <div className="mt-1.5 space-y-2 border rounded-md p-3">
          {questions.map((q: any, i: number) => (
            <div key={i} className="text-xs text-zinc-600">
              <span className="font-medium">{q.question}</span>
              {output?.type === "answered" && output.answers[i] && (
                <div className="mt-0.5 text-zinc-500">
                  {output.answers[i].selectedOptions.length > 0 && (
                    <span>Selected: {output.answers[i].selectedOptions.join(", ")}</span>
                  )}
                  {output.answers[i].customAnswer && (
                    <span className="ml-1">({output.answers[i].customAnswer})</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ChatToolExpand>
  )
}

const getFileName = (filePath: string) => {
  const parts = filePath.split("/")
  return parts[parts.length - 1]
}

const FileToolLabel = ({
  isLoading,
  filePath,
  loadingLabel,
  doneLabel
}: {
  isLoading: boolean
  filePath?: string
  loadingLabel: string
  doneLabel: string
}) => (
  <>
    <span className="shrink-0">{isLoading ? loadingLabel : doneLabel}</span>
    {filePath && (
      <span className="text-zinc-400 font-geist-mono truncate ml-1">{getFileName(filePath)}</span>
    )}
  </>
)

const FileToolPath = ({ filePath }: { filePath?: string }) =>
  filePath ? (
    <div className="mt-1.5 text-zinc-400 font-geist-mono text-xs overflow-hidden break-all line-clamp-1">
      {filePath}
    </div>
  ) : null

const ReadToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-Read" }>
  isLoading: boolean
}) => {
  const filePath = part.input?.file_path
  const content = (part.output as { content?: string } | undefined)?.content

  return (
    <ChatToolExpand
      isLoading={isLoading}
      label={
        <FileToolLabel
          isLoading={isLoading}
          filePath={filePath}
          loadingLabel="Reading"
          doneLabel="Read"
        />
      }
    >
      <FileToolPath filePath={filePath} />
      {content && (
        <div className="mt-1.5 rounded-md border p-2 text-sm">
          <pre className="rounded text-xs overflow-auto whitespace-pre-wrap max-h-[200px]">
            {content}
          </pre>
        </div>
      )}
    </ChatToolExpand>
  )
}

const WriteToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-Write" }>
  isLoading: boolean
}) => {
  const filePath = part.input?.file_path
  const content = part.input?.content

  return (
    <ChatToolExpand
      isLoading={isLoading}
      label={
        <FileToolLabel
          isLoading={isLoading}
          filePath={filePath}
          loadingLabel="Writing"
          doneLabel="Wrote"
        />
      }
    >
      <FileToolPath filePath={filePath} />
      {content && (
        <div className="mt-1.5 rounded-md border p-2 text-sm">
          <pre className="rounded text-xs overflow-auto whitespace-pre-wrap max-h-[200px]">
            {content}
          </pre>
        </div>
      )}
    </ChatToolExpand>
  )
}

const EditToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-Edit" }>
  isLoading: boolean
}) => {
  const filePath = part.input?.file_path
  const input = part.input

  return (
    <ChatToolExpand
      isLoading={isLoading}
      label={
        <FileToolLabel
          isLoading={isLoading}
          filePath={filePath}
          loadingLabel="Editing"
          doneLabel="Edited"
        />
      }
    >
      <FileToolPath filePath={filePath} />
      {input && (
        <div className="mt-1.5 rounded-md border p-2 text-sm">
          <pre className="rounded text-xs overflow-auto whitespace-pre-wrap max-h-[200px]">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}
    </ChatToolExpand>
  )
}

interface TaskMessagePart {
  type: string
  text?: string
  input?: Record<string, unknown>
  output?: unknown
  state?: string
}

interface TaskUIMessage {
  parts?: TaskMessagePart[]
}

const getTaskToolSummary = (part: TaskMessagePart): string => {
  const toolName = part.type.replace("tool-", "")
  const input = part.input
  switch (toolName) {
    case "Read":
      return input?.file_path ? `Read ${getFileName(String(input.file_path))}` : "Read file"
    case "WebSearch":
      return input?.query ? `Search "${input.query}"` : "Web search"
    case "WebFetch":
      return input?.url ? `Fetch ${getDomain(String(input.url))}` : "Web fetch"
    case "MemorySearch":
      return input?.query ? `Memory "${input.query}"` : "Memory search"
    case "MemoryGet":
      return input?.path ? `Memory ${String(input.path)}` : "Memory get"
    case "Bash":
      return input?.description ? String(input.description) : "Bash command"
    case "Write":
      return input?.file_path ? `Write ${getFileName(String(input.file_path))}` : "Write file"
    case "Edit":
      return input?.file_path ? `Edit ${getFileName(String(input.file_path))}` : "Edit file"
    default:
      return toolName
  }
}

const TaskToolBlock = ({
  part,
  isLoading
}: {
  part: Extract<CustomToolUIPart, { type: "tool-Task" }>
  isLoading: boolean
}) => {
  const description = part.input?.description
  const prompt = part.input?.prompt
  const output = part.output as TaskUIMessage | { success: false; error: string } | undefined
  const isPartLoading = part.state !== "output-available" && part.state !== "output-error"

  const messageParts = output && "parts" in output ? (output.parts ?? []) : []
  const textContent = messageParts
    .filter((p): p is TaskMessagePart & { text: string } => p.type === "text" && !!p.text)
    .map((p) => p.text)
    .join("")
  const toolCalls = messageParts.filter((p) => p.type.startsWith("tool-"))

  const label =
    description || (prompt ? prompt.slice(0, 60) + (prompt.length > 60 ? "..." : "") : "Subagent")

  return (
    <ChatToolExpand
      isLoading={isLoading && isPartLoading}
      label={
        <>
          <span className="shrink-0">
            {isLoading && isPartLoading ? "Running" : part.errorText ? "Failed" : "Completed"}:
          </span>
          <span className="truncate ml-1">{label}</span>
          {toolCalls.length > 0 && (
            <span className="shrink-0 ml-1 text-zinc-400">
              ({toolCalls.length} tool{toolCalls.length !== 1 ? "s" : ""})
            </span>
          )}
        </>
      }
    >
      <div className="mt-1.5 space-y-2">
        {prompt && (
          <div className="text-xs text-zinc-500">
            <span className="font-medium text-zinc-600">Prompt:</span> {prompt}
          </div>
        )}
        {part.errorText && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-600">
            {part.errorText}
          </div>
        )}
        {toolCalls.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {toolCalls.map((tc, i) => (
              <div key={i} className="truncate text-[11px] text-zinc-500 font-geist-mono">
                {getTaskToolSummary(tc)}
              </div>
            ))}
          </div>
        )}
        {textContent && (
          <div className="rounded-md border p-2">
            <pre className="text-xs overflow-auto whitespace-pre-wrap max-h-[300px]">
              {textContent}
            </pre>
          </div>
        )}
      </div>
    </ChatToolExpand>
  )
}

const ReadSkillToolBlock = ({
  part,
  isLoading
}: {
  part: CustomToolUIPart
  isLoading: boolean
}) => {
  const skillName = (part.input as any)?.name

  return (
    <div className="text-zinc-600 text-xs">
      {isLoading ? (
        <span className="animate-pulse">Loading skill...</span>
      ) : (
        skillName && <span>Loaded skill: {skillName}</span>
      )}
    </div>
  )
}

export function ToolBlock({ part, isLoading }: ToolBlockProps) {
  const input = part.input || {}
  const output = part.output

  const toolName = part.type.replace("tool-", "")

  // Dedicated Bash tool UI
  if (part.type === "tool-Bash") {
    return <BashToolBlock part={part} isLoading={isLoading} />
  }

  // Dedicated WebSearch tool UI
  if (part.type === "tool-WebSearch") {
    return <WebSearchToolBlock part={part} isLoading={isLoading} />
  }

  // Dedicated WebFetch tool UI
  if (part.type === "tool-WebFetch") {
    return <WebFetchToolBlock part={part} isLoading={isLoading} />
  }

  // Dedicated AskUserQuestion tool UI
  if (part.type === "tool-AskUserQuestion") {
    return <AskUserQuestionToolBlock part={part} isLoading={isLoading} />
  }

  // Dedicated Read/Write/Edit tool UI
  if (part.type === "tool-Read") {
    return <ReadToolBlock part={part} isLoading={isLoading} />
  }
  if (part.type === "tool-Write") {
    return <WriteToolBlock part={part} isLoading={isLoading} />
  }
  if (part.type === "tool-Edit") {
    return <EditToolBlock part={part} isLoading={isLoading} />
  }

  // Dedicated Task tool UI
  if (part.type === "tool-Task") {
    return <TaskToolBlock part={part} isLoading={isLoading} />
  }

  // Dedicated ReadSkill tool UI
  if (part.type.includes("ReadSkill")) {
    return <ReadSkillToolBlock part={part} isLoading={isLoading} />
  }

  if (part.errorText) {
    return <div className="text-red-500">{part.errorText}</div>
  }

  // Default tool UI
  return (
    <ChatToolExpand isLoading={isLoading} label={<span className="truncate">{toolName}</span>}>
      <div className="mt-1.5 rounded-md border p-2 text-sm">
        <div>
          <span className="font-semibold text-xs">Input:</span>
          <pre className="mt-1 rounded text-xs overflow-auto whitespace-pre-wrap">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
        {output && (
          <div className="mt-2">
            <span className="font-semibold text-xs">Output:</span>
            <pre className="mt-1 rounded text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </ChatToolExpand>
  )
}

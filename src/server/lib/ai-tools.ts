import {
  streamText,
  readUIMessageStream,
  stepCountIs,
  type GeneratedFile,
  type InferUITools,
  type LanguageModelUsage,
  tool,
  type ToolSet
} from "ai"
import Exa from "exa-js"
import z from "zod"
import { createSkillTools, type Skill } from "./skills"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import os from "node:os"
import { dirname, join, resolve } from "node:path"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import dayjs from "dayjs"
import type { Config, ModelConfig } from "@/types/config"
import { openMemoryDB, syncMemoryFiles, searchMemory } from "./memory-index"
import { createEmbedFn, embedQuery } from "./memory-embeddings"
import { getModelConfig } from "@/lib/providers"
import { getAISDKLanguageModel, getProviderOptions } from "./ai-sdk"
import { fetchModelsJSONWithCache } from "./fetch-models-json"
import { getAgentWorkspaceDir } from "./paths"

const execAsync = promisify(exec)

export type ChatSession = {}

export type RequestConfirmation = (opts: {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}) => Promise<boolean>

export type QuestionAnswerData = {
  answers: Array<{
    question: string
    selectedOptions: string[]
    customAnswer?: string
  }>
}

export type RequestUserAnswer = (opts: {
  toolCallId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
}) => Promise<QuestionAnswerData | null>

export type UsageUpdateData = {
  taskToolCallId?: string
  usage?: LanguageModelUsage
  providerMetadata?: Record<string, unknown>
  files?: GeneratedFile[]
  modelConfig?: ModelConfig
}

export type UsageUpdateHandler = (data: UsageUpdateData) => void

type CreateAIToolsOptions = {
  chatId: string
  agentId: string
  chatSession: ChatSession
  signal: AbortSignal
  skills?: Skill[]
  requestConfirmation: RequestConfirmation
  requestUserAnswer: RequestUserAnswer
  config: Config
  onUsageUpdate?: UsageUpdateHandler
}

/** Tools that require user confirmation before execution */
export const TOOLS_REQUIRING_CONFIRMATION = ["Bash", "Write", "Edit"] as const

export const createAITools = ({
  chatId,
  agentId,
  chatSession,
  signal,
  skills = [],
  requestConfirmation,
  requestUserAnswer,
  config,
  onUsageUpdate
}: CreateAIToolsOptions) => {
  const skillTools = createSkillTools(skills)

  // Working directory for this agent
  const workingDir = getAgentWorkspaceDir(agentId)

  /** Check if a file path is inside the agent's working directory */
  const isInWorkingDir = (filePath: string) => {
    const resolved = resolve(filePath)
    return resolved.startsWith(workingDir + "/") || resolved === workingDir
  }

  const baseTools = {
    ...skillTools,

    WebFetch: tool({
      description: "Fetches a web URL as markdown",
      inputSchema: z.object({
        url: z.string().describe("The URL to fetch")
      }),
      execute: async ({ url }) => {
        const fetchProvider = config.webFetchProvider
        if (!fetchProvider) {
          return {
            error:
              "Web fetch is not configured. Please set up a web fetch provider in Settings > General."
          }
        }

        if (fetchProvider === "command") {
          const cmd = config.webFetchCommand
          if (!cmd) {
            return {
              error: "Web fetch command is not configured. Please set it in Settings > General."
            }
          }
          const fullCmd = cmd.replaceAll("$URL", url)
          try {
            const { stdout } = await execAsync(fullCmd, {
              timeout: 30000,
              maxBuffer: 1024 * 1024 * 10
            })
            signal.throwIfAborted()
            return { content: stdout }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            return { error: `Command failed: ${message}` }
          }
        }

        if (fetchProvider === "fetch") {
          const response = await fetch(url, { signal })
          if (!response.ok) {
            return { error: `Failed to fetch URL: ${url} (${response.status})` }
          }
          const text = await response.text()
          return {
            title: url,
            content: text.slice(0, 8000),
            favicon: "",
            published: ""
          }
        }

        // Exa provider
        const apiKey = config.exa?.apiKey
        if (!apiKey) {
          return { error: "Exa API key is not configured. Please set it in Settings > General." }
        }
        const exa = new Exa(apiKey)
        const contents = await exa.getContents(url, {
          text: { maxCharacters: 8000 }
        })

        signal.throwIfAborted()

        const page = contents.results[0]
        return {
          title: page.title,
          content: page.text,
          favicon: page.favicon,
          published: page.publishedDate
        }
      }
    }),

    WebSearch: tool({
      description: `
- Allow the assistant to search the web and use the results to inform responses
- Use this tool for accessing information beyond Model's knowledge cutoff date

IMPORTANT - Use the correct year in search queries:
  - Today's date is ${dayjs().format("YYYY-MM-DD")}. You MUST use this year when searching for recent information, documentation, or current events.
  - Example: If the user asks for "latest React docs", search for \"React documentation ${dayjs().format("YYYY")}}\", NOT \"React documentation 2025\"
      `.trim(),
      inputSchema: z.object({
        query: z.string().describe("The search query")
      }),
      execute: async ({ query }) => {
        if (!config.webSearchProvider) {
          return {
            error:
              "Web search is not configured. Please set up a web search provider in Settings > General."
          }
        }

        if (config.webSearchProvider === "command") {
          const cmd = config.webSearchCommand
          if (!cmd) {
            return {
              error: "Web search command is not configured. Please set it in Settings > General."
            }
          }

          const fullCmd = cmd.replaceAll("$QUERY", query)
          try {
            const { stdout } = await execAsync(fullCmd, {
              timeout: 30000,
              maxBuffer: 1024 * 1024 * 10
            })
            signal.throwIfAborted()
            return { content: stdout }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            return { error: `Command failed: ${message}` }
          }
        }

        if (config.webSearchProvider === "braveSearch") {
          const apiKey = config.braveSearch?.apiKey
          if (!apiKey) {
            return {
              error: "Brave Search API key is not configured. Please set it in Settings > General."
            }
          }

          const url = new URL("https://api.search.brave.com/res/v1/web/search")
          url.searchParams.set("q", query)
          url.searchParams.set("count", "5")

          const response = await fetch(url, {
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip",
              "X-Subscription-Token": apiKey
            },
            signal
          })

          if (!response.ok) {
            return { error: `Brave search failed: ${response.status} ${response.statusText}` }
          }

          const data = (await response.json()) as {
            web?: {
              results?: Array<{
                title: string
                url: string
                description: string
              }>
            }
          }

          return (data.web?.results ?? []).map((result) => ({
            title: result.title,
            url: result.url,
            content: result.description
          }))
        }

        // Exa provider
        const apiKey = config.exa?.apiKey
        if (!apiKey) {
          return { error: "Exa API key is not configured. Please set it in Settings > General." }
        }
        const exa = new Exa(apiKey)
        const result = await exa.searchAndContents(query, {
          type: "auto",
          text: { maxCharacters: 6000 },
          livecrawl: "preferred"
        })
        signal.throwIfAborted()
        return result.results.map((result) => ({
          title: result.title,
          url: result.url,
          score: result.score,
          content: result.text
        }))
      }
    }),

    Read: tool({
      description:
        "Reads a file from the local filesystem. The file_path parameter must be an absolute path. You can optionally specify a line offset and limit for large files.",
      inputSchema: z.object({
        file_path: z.string().describe("The absolute path to the file to read"),
        offset: z
          .number()
          .optional()
          .describe(
            "The line number to start reading from. Only provide if the file is too large to read at once"
          ),
        limit: z
          .number()
          .optional()
          .describe(
            "The number of lines to read. Only provide if the file is too large to read at once."
          ),
        pages: z
          .string()
          .optional()
          .describe(
            'Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files. Maximum 20 pages per request.'
          )
      }),
      execute: async ({ file_path, offset, limit }) => {
        signal.throwIfAborted()

        try {
          const content = await fs.readFile(file_path, "utf-8")
          const lines = content.split("\n")

          const startLine = offset ?? 0
          const endLine = limit ? startLine + limit : lines.length
          const slicedLines = lines.slice(startLine, endLine)

          return {
            content: slicedLines.join("\n"),
            file_path,
            success: true
          }
        } catch (error: any) {
          return {
            content: "",
            file_path,
            success: false,
            error: error.message
          }
        }
      }
    }),

    MemorySearch: tool({
      description:
        "Search memory files (memory/*.md) for relevant past conversations, decisions, and context. Use this before answering questions about prior work, decisions, preferences, or anything that might have been discussed in previous sessions. Returns file paths and line ranges — use MemoryGet to read the actual content.",
      inputSchema: z.object({
        query: z.string().describe("The search query to find relevant memories"),
        maxResults: z
          .number()
          .optional()
          .default(5)
          .describe("Maximum number of results to return (default 5)")
      }),
      execute: async ({ query, maxResults }) => {
        signal.throwIfAborted()

        try {
          const db = await openMemoryDB(agentId)
          const embedFn = createEmbedFn(config)
          await syncMemoryFiles(db, workingDir, embedFn ?? undefined, config.embeddingModel)

          const queryEmbed = await embedQuery(config, query)
          const results = await searchMemory(db, query, queryEmbed ?? undefined, { maxResults })

          if (results.length === 0) {
            return { results: [], message: "No relevant memories found." }
          }

          return {
            results: results.map((r) => ({
              path: r.path,
              lines: `L${r.startLine}-L${r.endLine}`,
              score: r.score
            }))
          }
        } catch (error: any) {
          return { results: [], error: error.message }
        }
      }
    }),

    MemoryGet: tool({
      description:
        "Read content from a memory file (memory/*.md) with optional line range. Use after MemorySearch to pull only the needed lines and keep context small.",
      inputSchema: z.object({
        path: z.string().describe("Relative path to the memory file (as returned by MemorySearch)"),
        from: z
          .number()
          .optional()
          .describe("Starting line number (1-based). Omit to start from beginning."),
        lines: z
          .number()
          .optional()
          .describe("Number of lines to read. Omit to read to end of file.")
      }),
      execute: async ({ path: relPath, from, lines: lineCount }) => {
        signal.throwIfAborted()

        try {
          const absPath = resolve(join(workingDir, relPath))

          // Ensure the resolved path is within the working directory
          if (!isInWorkingDir(absPath)) {
            return { path: relPath, text: "", error: "Path is outside the working directory." }
          }

          const content = await fs.readFile(absPath, "utf-8")

          if (!from && !lineCount) {
            return { path: relPath, text: content }
          }

          const allLines = content.split("\n")
          const start = Math.max(1, from ?? 1)
          const count = Math.max(1, lineCount ?? allLines.length)
          const slice = allLines.slice(start - 1, start - 1 + count)

          return { path: relPath, text: slice.join("\n") }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          return { path: relPath, text: "", error: message }
        }
      }
    }),

    Bash: tool({
      description:
        "Executes a bash command. Use for running scripts, commands, or any shell operations.",
      inputSchema: z.object({
        command: z.string().describe("The bash command to execute"),
        description: z
          .string()
          .describe("A very very concise and to-the-point description of what the command does"),
        cwd: z
          .string()
          .optional()
          .describe("Optional working directory (defaults to the working directory)"),
        timeout: z.number().optional().describe("Optional timeout in milliseconds (max 600000)")
      }),
      execute: async (
        { command, description, cwd, timeout },
        { toolCallId }
      ): Promise<
        | { type: "aborted"; message: string }
        | {
            type: "executed"
            stdout: string
            stderr: string
            cwd: string
          }
      > => {
        signal.throwIfAborted()

        if (requestConfirmation) {
          const approved = await requestConfirmation({
            toolCallId,
            toolName: "Bash",
            args: { command, description, cwd }
          })
          if (!approved) {
            return {
              type: "aborted",
              message: "User rejected this tool call."
            }
          }
        }

        // Ensure the working directory exists
        if (!existsSync(workingDir)) {
          await fs.mkdir(workingDir, { recursive: true })
        }

        const effectiveCwd = cwd || workingDir

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: effectiveCwd,
            timeout: Math.min(timeout ?? 120000, 600000), // Default 2 minutes, max 10 minutes
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          })

          return {
            type: "executed",
            stdout: stdout || "",
            stderr: stderr || "",
            cwd: effectiveCwd
          }
        } catch (error: any) {
          return {
            type: "aborted",
            message: error.message
          }
        }
      }
    }),

    Write: tool({
      description:
        "Writes a file to the local filesystem. This tool will overwrite the existing file if there is one at the provided path.",
      inputSchema: z.object({
        file_path: z
          .string()
          .describe("The absolute path to the file to write (must be absolute, not relative)"),
        content: z.string().describe("The content to write to the file")
      }),
      execute: async ({ file_path, content }, { toolCallId }) => {
        signal.throwIfAborted()

        if (requestConfirmation && !isInWorkingDir(file_path)) {
          const approved = await requestConfirmation({
            toolCallId,
            toolName: "Write",
            args: { file_path, content }
          })
          if (!approved) {
            return {
              file_path,
              success: false,
              error: "User rejected this tool call."
            }
          }
        }

        try {
          await fs.mkdir(dirname(file_path), { recursive: true })
          await fs.writeFile(file_path, content, "utf-8")
          return {
            file_path,
            success: true
          }
        } catch (error: any) {
          return {
            file_path,
            success: false,
            error: error.message
          }
        }
      }
    }),

    Edit: tool({
      description:
        "Performs exact string replacements in files. The edit will fail if old_string is not found or is not unique in the file (unless replace_all is true).",
      inputSchema: z.object({
        file_path: z.string().describe("The absolute path to the file to modify"),
        old_string: z.string().describe("The text to replace"),
        new_string: z
          .string()
          .describe("The text to replace it with (must be different from old_string)"),
        replace_all: z
          .boolean()
          .default(false)
          .describe("Replace all occurrences of old_string (default false)")
      }),
      execute: async ({ file_path, old_string, new_string, replace_all }, { toolCallId }) => {
        signal.throwIfAborted()

        if (old_string === new_string) {
          return {
            file_path,
            success: false,
            error: "old_string and new_string must be different"
          }
        }

        if (requestConfirmation && !isInWorkingDir(file_path)) {
          const approved = await requestConfirmation({
            toolCallId,
            toolName: "Edit",
            args: { file_path, old_string, new_string, replace_all }
          })
          if (!approved) {
            return {
              file_path,
              success: false,
              error: "User rejected this tool call."
            }
          }
        }

        try {
          const content = await fs.readFile(file_path, "utf-8")

          if (!content.includes(old_string)) {
            return {
              file_path,
              success: false,
              error: `old_string not found in ${file_path}`
            }
          }

          if (!replace_all) {
            const firstIndex = content.indexOf(old_string)
            const secondIndex = content.indexOf(old_string, firstIndex + old_string.length)
            if (secondIndex !== -1) {
              return {
                file_path,
                success: false,
                error:
                  "old_string is not unique in the file. Provide more context to make it unique, or set replace_all to true."
              }
            }
          }

          const newContent = replace_all
            ? content.replaceAll(old_string, new_string)
            : content.replace(old_string, new_string)

          await fs.writeFile(file_path, newContent, "utf-8")

          return {
            file_path,
            success: true
          }
        } catch (error: any) {
          return {
            file_path,
            success: false,
            error: error.message
          }
        }
      }
    }),

    AskUserQuestion: tool({
      description:
        "Asks the user a structured question with selectable options. Use this to clarify requirements, get preferences, or ask for decisions. Each question can have 2-4 options. Users can also provide a custom answer.",
      inputSchema: z.object({
        questions: z
          .array(
            z.object({
              question: z.string().describe("The question to ask the user"),
              header: z.string().describe("Short label for the question (max 12 chars)"),
              options: z
                .array(
                  z.object({
                    label: z.string().describe("Short option label (1-5 words)"),
                    description: z.string().describe("Explanation of this option")
                  })
                )
                .min(2)
                .max(4)
                .describe("Available choices"),
              multiSelect: z.boolean().default(false).describe("Allow selecting multiple options")
            })
          )
          .min(1)
          .max(4)
          .describe("Questions to ask the user")
      }),
      execute: async ({ questions }, { toolCallId }) => {
        const result = await requestUserAnswer({ toolCallId, questions })

        if (!result) {
          throw new Error("User did not answer the question in time.")
        }

        return {
          type: "answered" as const,
          answers: result.answers
        }
      }
    })
  } satisfies ToolSet

  const readOnlyToolNames = [
    "WebFetch",
    "WebSearch",
    "Read",
    "MemorySearch",
    "MemoryGet"
  ] as const satisfies (keyof typeof baseTools)[]

  const tools = {
    ...baseTools,

    Task: tool({
      description: [
        "Launch a new agent to handle complex, multi-step tasks autonomously.",
        "",
        "The Task tool launches specialized agents that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.",
        "",
        "Available agent types and the tools they have access to:",
        `- Bash: Command execution specialist for running bash commands. Use this for command execution and other terminal tasks. (Tools: Bash)`,
        `- general-purpose: General-purpose agent for researching complex questions, searching for information, and executing multi-step tasks. When you are searching for something and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you. (Tools: ${Object.keys(baseTools).join(", ")})`,
        `- Explore: Fast agent specialized for exploring and researching. Use this when you need to search the web, read files, look up documentation, or answer questions that require gathering information. When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis. (Tools: ${readOnlyToolNames.join(", ")})`,
        `- Plan: Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs. (Tools: ${readOnlyToolNames.join(", ")})`,
        "",
        "When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.",
        "",
        "When NOT to use the Task tool:",
        "- If you want to read a specific file, use the Read tool directly",
        "- If the task is simple enough to do in one or two tool calls, do it yourself",
        "- Other tasks that are not related to the agent descriptions above",
        "",
        "",
        "Usage notes:",
        "- Always include a short description (3-5 words) summarizing what the agent will do",
        "- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses",
        "- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.",
        "- Provide clear, detailed prompts so the agent can work autonomously and return exactly the information you need.",
        "- The subagent has no conversation history — include all necessary context in the prompt",
        "- The agent's outputs should generally be trusted",
        "- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent",
        '- If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple Task tool use content blocks. For example, if you need to launch both a build-validator agent and a test-runner agent in parallel, send a single message with both tool calls.',
        "",
        "Example usage:",
        "",
        "<example_agent_descriptions>",
        '"test-runner": use this agent after you are done writing code to run tests',
        '"greeting-responder": use this agent to respond to user greetings with a friendly joke',
        "</example_agent_descriptions>",
        "",
        "<example>",
        'user: "Please write a function that checks if a number is prime"',
        "assistant: Sure let me write a function that checks if a number is prime",
        "assistant: First let me use the Write tool to write a function that checks if a number is prime",
        "assistant: I'm going to use the Write tool to write the following code:",
        "<code>",
        "function isPrime(n) {",
        "  if (n <= 1) return false",
        "  for (let i = 2; i * i <= n; i++) {",
        "    if (n % i === 0) return false",
        "  }",
        "  return true",
        "}",
        "</code>",
        "<commentary>",
        "Since a significant piece of code was written and the task was completed, now use the test-runner agent to run the tests",
        "</commentary>",
        "assistant: Now let me use the test-runner agent to run the tests",
        "assistant: Uses the Task tool to launch the test-runner agent",
        "</example>",
        "",
        "<example>",
        'user: "Hello"',
        "<commentary>",
        "Since the user is greeting, use the greeting-responder agent to respond with a friendly joke",
        "</commentary>",
        'assistant: "I\'m going to use the Task tool to launch the greeting-responder agent"',
        "</example>"
      ].join("\n"),
      inputSchema: z.object({
        description: z.string().describe("A short (3-5 word) description of the task"),
        prompt: z
          .string()
          .describe(
            "The task for the agent to perform. Provide clear, detailed instructions with all necessary context."
          ),
        subagent_type: z
          .enum(["Bash", "general-purpose", "Explore", "Plan"])
          .describe("The type of subagent to launch. Each type has different tools available."),
        maxSteps: z
          .number()
          .optional()
          .describe(
            "Maximum number of agentic steps (default 10, max 20). Higher for complex multi-tool tasks."
          )
      }),
      execute: async function* ({ prompt: task, subagent_type, maxSteps: rawMaxSteps }, context) {
        const taskToolCallId = context.toolCallId
        signal.throwIfAborted()

        const maxSteps = Math.min(Math.max(rawMaxSteps ?? 10, 1), 20)

        // Resolve model: use specified agent's model, or current agent's model
        const targetAgentId = agentId
        const agentConfig = config.agents.find((a) => a.id === targetAgentId)
        const fullModelId = agentConfig?.model
        if (!fullModelId) {
          throw new Error(`Agent "${targetAgentId}" not found or has no model configured.`)
        }

        // Resolve model and provider
        const modelsJSON = await fetchModelsJSONWithCache()
        const { model: subagentModelConfig, provider: subagentProvider } = getModelConfig(
          modelsJSON,
          config,
          fullModelId
        )

        if (!subagentModelConfig || !subagentProvider) {
          throw new Error(
            `Could not resolve model "${fullModelId}". Ensure the provider and model are configured.`
          )
        }

        const subagentLanguageModel = getAISDKLanguageModel({
          modelConfig: subagentModelConfig,
          providerConfig: subagentProvider
        })

        const activeTools =
          subagent_type === "general-purpose"
            ? undefined
            : subagent_type === "Bash"
              ? (["Bash"] as (keyof typeof baseTools & string)[])
              : ([...readOnlyToolNames] as (keyof typeof baseTools & string)[])

        const availableToolNames = activeTools ?? Object.keys(baseTools)

        const roleDescription = {
          Bash: "You are a command execution specialist. Run bash commands to complete the assigned task.",
          "general-purpose":
            "You are a general-purpose agent. Complete the assigned task using all available tools.",
          Explore:
            "You are an exploration and research agent. Gather information and return a clear, comprehensive answer. Focus on gathering and synthesizing information.",
          Plan: "You are a software architect agent. Design implementation plans for the assigned task. Return step-by-step plans, identify critical files, and consider architectural trade-offs."
        }[subagent_type]

        const subagentSystemPrompt = [
          roleDescription,
          `Available tools: ${availableToolNames.join(", ")}`,
          `Working directory: ${workingDir}`,
          `Platform: ${os.platform()}`,
          `Current date: ${dayjs().format("YYYY-MM-DD")}`
        ].join("\n\n")

        const result = streamText({
          model: subagentLanguageModel,
          system: subagentSystemPrompt,
          providerOptions: getProviderOptions(),
          prompt: task,
          tools: baseTools,
          activeTools,
          stopWhen: stepCountIs(maxSteps),
          abortSignal: signal,
          onStepFinish({ usage, providerMetadata, files }) {
            onUsageUpdate?.({
              taskToolCallId,
              usage,
              providerMetadata: providerMetadata as Record<string, unknown> | undefined,
              files,
              modelConfig: subagentModelConfig
            })
          }
        })

        let lastMessage: unknown
        let lastYieldTime = 0

        for await (const message of readUIMessageStream({
          stream: result.toUIMessageStream()
        })) {
          lastMessage = message
          const now = Date.now()
          // Throttle yields to avoid OOM from too many intermediate message copies
          if (now - lastYieldTime >= 1000) {
            lastYieldTime = now
            yield message
          }
        }

        // Always yield the final message
        if (lastMessage) {
          yield lastMessage
        }
      },
      toModelOutput: ({ output: message }) => {
        if (!message || !("parts" in message)) {
          return { type: "text" as const, value: "Task completed." }
        }
        const parts = (message as { parts: Array<{ type: string; text?: string }> }).parts
        let lastText = "Task completed."
        for (const p of parts) {
          if (p.type === "text" && p.text) {
            lastText = p.text
          }
        }
        return {
          type: "text" as const,
          value: lastText
        }
      }
    })
  } satisfies ToolSet

  return tools
}

export type AIToolSet = ReturnType<typeof createAITools>

export type CustomUITools = InferUITools<AIToolSet>

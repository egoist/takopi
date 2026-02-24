import { generateId } from "ai"
import { readFile, stat } from "node:fs/promises"
import { isAbsolute, relative as getRelativePath, resolve } from "node:path"
import { Bot, GrammyError, type Context } from "grammy"
import { createSpecialUserMessage, createUserMessage, getDisplayedMessages } from "@/lib/chat"
import type { ChatMessage } from "@/types/chat"
import type { AgentConfig, Config } from "@/types/config"
import type { TelegramPendingUser } from "@/types/telegram"
import { getChatMessages } from "./chat-storage"
import { getConfig, saveConfig } from "./config"
import { saveSessionMemory } from "./memory"
import { getAgentWorkspaceDir } from "./paths"
import {
  getTelegramActiveChatId as getStoredTelegramActiveChatId,
  setTelegramActiveChatId as setStoredTelegramActiveChatId
} from "./telegram-active-chats"
import { addTelegramPendingUser, removeTelegramPendingUser } from "./telegram-pending-users"
import { runChatTurn } from "./chat-turn"

const TELEGRAM_MAX_STEPS = 20
const TELEGRAM_MESSAGE_LIMIT = 4000
const TELEGRAM_STREAM_MIN_WORDS = 20
const TELEGRAM_CONFLICT_RETRY_MS = 5000
const TELEGRAM_REVEAL_MAX_CHARACTERS = 120_000
const TELEGRAM_ALLOWED_TOOLS = [
  "ReadSkill",
  "WebFetch",
  "WebSearch",
  "Read",
  "MemorySearch",
  "MemoryGet"
] as const
const TELEGRAM_COMMANDS = [
  {
    command: "start",
    description: "Show bot status"
  },
  {
    command: "help",
    description: "Show available commands"
  },
  {
    command: "new",
    description: "Start a fresh chat"
  },
  {
    command: "reveal",
    description: "Show a workspace file"
  }
]
const TELEGRAM_PENDING_APPROVAL_MESSAGE =
  "Access request sent. Please ask the Takopi owner to approve your Telegram account in Settings."

type TelegramState = {
  bot: Bot | null
  token: string | null
  enabled: boolean
  config: Config | null
  chatQueues: Map<number, Promise<void>>
  approvalWriteQueue: Promise<void>
  retryTimer: ReturnType<typeof setTimeout> | null
}

const telegramState: TelegramState = {
  bot: null,
  token: null,
  enabled: false,
  config: null,
  chatQueues: new Map(),
  approvalWriteQueue: Promise.resolve(),
  retryTimer: null
}

export function syncTelegramBot(config: Config) {
  telegramState.config = config

  const token = config.telegram?.botToken?.trim() || ""
  const enabled = Boolean(config.telegram?.enabled && token)
  const nextToken = enabled ? token : null
  const tokenChanged = telegramState.token !== nextToken
  const enabledChanged = telegramState.enabled !== enabled

  telegramState.enabled = enabled

  if (!enabled || !nextToken) {
    stopBot()
    return
  }

  if (tokenChanged || enabledChanged || !telegramState.bot) {
    stopBot()
    startBot(nextToken)
  }
}

function startBot(token: string) {
  console.log("[telegram] Starting bot...")

  clearRetryTimer()
  const bot = new Bot(token)

  bot.catch((error) => {
    console.error("[telegram] Bot error:", error.error)
  })

  bot.on("message:text", async (ctx) => {
    await enqueueByChat(ctx.chat.id, async () => {
      await handleMessage(ctx)
    })
  })

  telegramState.bot = bot
  telegramState.token = token

  void setupCommandMenu(bot)

  void bot
    .start({
      drop_pending_updates: false,
      onStart: () => {
        clearRetryTimer()
        console.log("[telegram] Polling started")
      }
    })
    .catch((error) => {
      if (telegramState.bot !== bot) {
        return
      }
      if (isPollingConflictError(error)) {
        bot.stop()
        telegramState.bot = null
        console.warn(
          `[telegram] Polling conflict detected. Retrying in ${Math.round(TELEGRAM_CONFLICT_RETRY_MS / 1000)}s.`
        )
        scheduleBotRetry(token)
        return
      }
      console.error("[telegram] Failed to start bot:", error)
      if (telegramState.bot === bot) {
        stopBot()
      }
    })
}

async function setupCommandMenu(bot: Bot) {
  try {
    await bot.api.setMyCommands(
      TELEGRAM_COMMANDS.map((command) => ({
        command: command.command,
        description: command.description
      }))
    )
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "commands"
      }
    })
  } catch (error) {
    console.error("[telegram] Failed to set command menu:", error)
  }
}

function stopBot() {
  if (telegramState.bot) {
    telegramState.bot.stop()
    console.log("[telegram] Disabled")
  }
  clearRetryTimer()
  telegramState.bot = null
  telegramState.token = null
  telegramState.chatQueues.clear()
}

function clearRetryTimer() {
  if (telegramState.retryTimer) {
    clearTimeout(telegramState.retryTimer)
    telegramState.retryTimer = null
  }
}

function scheduleBotRetry(token: string) {
  if (telegramState.retryTimer) {
    return
  }

  telegramState.retryTimer = setTimeout(() => {
    telegramState.retryTimer = null

    const currentConfig = telegramState.config
    const configuredToken = currentConfig?.telegram?.botToken?.trim() || ""
    const enabled = Boolean(currentConfig?.telegram?.enabled && configuredToken)
    if (!enabled || configuredToken !== token) {
      return
    }
    if (telegramState.bot) {
      return
    }

    startBot(token)
  }, TELEGRAM_CONFLICT_RETRY_MS)
}

function isPollingConflictError(error: unknown): boolean {
  if (error instanceof GrammyError) {
    return error.error_code === 409
  }

  if (error instanceof Error) {
    return error.message.includes("(409:")
  }

  return false
}

function enqueueByChat(chatId: number, task: () => Promise<void>) {
  const previous = telegramState.chatQueues.get(chatId) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(task)
  telegramState.chatQueues.set(chatId, current)
  void current.finally(() => {
    if (telegramState.chatQueues.get(chatId) === current) {
      telegramState.chatQueues.delete(chatId)
    }
  })
  return current
}

async function handleMessage(ctx: Context) {
  if (!ctx.chat || ctx.chat.type !== "private") {
    return
  }
  if (ctx.from?.is_bot) {
    return
  }

  const text = ctx.message?.text?.trim() || ""
  if (!text) {
    await sendText(ctx, "Please send text messages only.")
    return
  }

  const commandToken = text.split(/\s+/, 1)[0].toLowerCase()
  const commandArgs = text.slice(commandToken.length).trim()
  const isCommand = (name: "start" | "help" | "new" | "reveal") => {
    return commandToken === `/${name}` || commandToken.startsWith(`/${name}@`)
  }

  const config = telegramState.config
  if (!config) {
    await sendText(ctx, "Telegram integration is still initializing. Please retry.")
    return
  }

  const agent = resolveAgent(config)
  if (!agent) {
    await sendText(ctx, "No agent is configured. Set up an agent in Settings first.")
    return
  }

  const requester = ctx.from
  if (!requester) {
    return
  }
  const authStatus = await resolveTelegramAuthStatus(config, requester.id)
  if (!authStatus.approved) {
    await ensureTelegramUserPending(requester)
    await sendText(ctx, TELEGRAM_PENDING_APPROVAL_MESSAGE)
    return
  }

  const localChatId = await getActiveTelegramChatId(ctx.chat.id)

  if (isCommand("start") || isCommand("help")) {
    await sendText(ctx, getTelegramHelpText(agent))
    return
  }

  if (isCommand("new")) {
    await saveTelegramSessionMemory(localChatId, agent.id)
    await setActiveTelegramChatId(ctx.chat.id, createTelegramChatId(ctx.chat.id))
    await sendText(ctx, "Started a new chat.")
    return
  }

  if (isCommand("reveal")) {
    if (!commandArgs) {
      await sendText(ctx, "Usage: /reveal <filename>")
      return
    }

    await ctx.replyWithChatAction("typing")
    const revealResult = await revealAgentWorkspaceFile(agent.id, commandArgs)
    if (!revealResult.ok) {
      await sendText(ctx, revealResult.message)
      return
    }

    const fileBody = revealResult.content || "(empty file)"
    await sendPlainText(ctx, `File: ${revealResult.path}\n\n${fileBody}`)
    if (revealResult.truncated) {
      await sendText(
        ctx,
        `Output truncated at ${TELEGRAM_REVEAL_MAX_CHARACTERS.toLocaleString()} characters.`
      )
    }
    return
  }

  await ctx.replyWithChatAction("typing")

  try {
    const paragraphStreamer = createTelegramParagraphStreamer({
      minWords: TELEGRAM_STREAM_MIN_WORDS,
      onChunk: async (chunk) => {
        await sendText(ctx, chunk)
      }
    })
    const reply = await runTurn({
      config,
      agent,
      localChatId,
      input: text,
      onTextDelta: async (delta) => {
        await paragraphStreamer.push(delta)
      }
    })
    await paragraphStreamer.flush()
    if (!paragraphStreamer.hasSent()) {
      await sendText(ctx, reply)
    }
  } catch (error) {
    console.error("[telegram] Failed to handle message:", error)
    await sendText(ctx, "I hit an error while generating a reply.")
  }
}

function resolveAgent(config: Config): AgentConfig | null {
  const preferredAgentId = config.telegram?.agentId || config.defaultAgent || config.agents[0]?.id
  if (!preferredAgentId) {
    return null
  }
  return config.agents.find((agent) => agent.id === preferredAgentId) ?? null
}

function getTelegramHelpText(agent: AgentConfig): string {
  return [
    "Connected to Takopi.",
    `Using agent: ${agent.name || agent.id}`,
    "",
    "Commands:",
    "/new - start a fresh chat",
    "/reveal <filename> - show a file in the agent workspace"
  ].join("\n")
}

async function revealAgentWorkspaceFile(
  agentId: string,
  requestedPath: string
):
  Promise<{ ok: true; path: string; content: string; truncated: boolean } | { ok: false; message: string }> {
  const normalizedPath = requestedPath.trim()
  if (!normalizedPath) {
    return {
      ok: false,
      message: "Usage: /reveal <filename>"
    }
  }
  if (isAbsolute(normalizedPath) || /^[A-Za-z]:[\\/]/.test(normalizedPath)) {
    return {
      ok: false,
      message: "Please provide a path relative to the agent workspace."
    }
  }

  const workspaceDir = resolve(getAgentWorkspaceDir(agentId))
  const resolvedPath = resolve(workspaceDir, normalizedPath)
  if (!isPathInsideRoot(workspaceDir, resolvedPath)) {
    return {
      ok: false,
      message: "Path must stay within the agent workspace."
    }
  }

  let fileStats: Awaited<ReturnType<typeof stat>>
  try {
    fileStats = await stat(resolvedPath)
  } catch {
    return {
      ok: false,
      message: `File not found: ${normalizedPath}`
    }
  }

  if (!fileStats.isFile()) {
    return {
      ok: false,
      message: `Not a file: ${normalizedPath}`
    }
  }

  const content = await readFile(resolvedPath, "utf-8")
  if (content.includes("\u0000")) {
    return {
      ok: false,
      message: "This file looks binary and can't be shown as text."
    }
  }

  const truncated = content.length > TELEGRAM_REVEAL_MAX_CHARACTERS
  return {
    ok: true,
    path: getRelativePath(workspaceDir, resolvedPath) || normalizedPath,
    content: truncated ? content.slice(0, TELEGRAM_REVEAL_MAX_CHARACTERS) : content,
    truncated
  }
}

function isPathInsideRoot(rootDir: string, filePath: string): boolean {
  const relativePath = getRelativePath(rootDir, filePath)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

function isTelegramUserApproved(config: Config, userId: number): boolean {
  const approvedUserIds = config.telegram?.approvedUserIds ?? []
  return approvedUserIds.includes(userId)
}

async function resolveTelegramAuthStatus(
  config: Config,
  userId: number
): Promise<{ approved: boolean; autoApproved: boolean }> {
  if (isTelegramUserApproved(config, userId)) {
    return {
      approved: true,
      autoApproved: false
    }
  }

  const approvedUserIds = config.telegram?.approvedUserIds ?? []
  if (approvedUserIds.length > 0) {
    return {
      approved: false,
      autoApproved: false
    }
  }

  const autoApproved = await autoApproveFirstTelegramUser(userId)
  return {
    approved: autoApproved,
    autoApproved
  }
}

async function autoApproveFirstTelegramUser(userId: number): Promise<boolean> {
  let approved = false
  const previousQueue = telegramState.approvalWriteQueue
  telegramState.approvalWriteQueue = previousQueue
    .catch(() => {})
    .then(async () => {
      const latestConfig = await getConfig()
      const approvedUserIds = latestConfig.telegram?.approvedUserIds ?? []
      if (approvedUserIds.includes(userId)) {
        approved = true
        telegramState.config = latestConfig
        return
      }
      if (approvedUserIds.length > 0) {
        approved = false
        telegramState.config = latestConfig
        return
      }

      const nextConfig: Config = {
        ...latestConfig,
        telegram: {
          ...(latestConfig.telegram ?? {}),
          approvedUserIds: [userId]
        }
      }
      await saveConfig(nextConfig)
      telegramState.config = nextConfig
      approved = true
      await removeTelegramPendingUser(userId).catch(() => {})
    })

  await telegramState.approvalWriteQueue
  return approved
}

function mapPendingTelegramUser(user: NonNullable<Context["from"]>): TelegramPendingUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    requestedAt: Date.now()
  }
}

async function ensureTelegramUserPending(user: NonNullable<Context["from"]>) {
  await addTelegramPendingUser(mapPendingTelegramUser(user))
}

function createTelegramChatId(telegramChatId: number): string {
  return `telegram-${telegramChatId}-${generateId()}`
}

async function getActiveTelegramChatId(telegramChatId: number): Promise<string> {
  const existingChatId = await getStoredTelegramActiveChatId(telegramChatId)
  if (existingChatId) {
    return existingChatId
  }

  const newChatId = createTelegramChatId(telegramChatId)
  await setStoredTelegramActiveChatId(telegramChatId, newChatId)
  return newChatId
}

async function setActiveTelegramChatId(telegramChatId: number, chatId: string) {
  await setStoredTelegramActiveChatId(telegramChatId, chatId)
}

async function saveTelegramSessionMemory(chatId: string, agentId: string) {
  try {
    const messages = await getChatMessages(chatId)
    if (messages.length === 0) {
      return
    }
    const workspaceDir = getAgentWorkspaceDir(agentId)
    await saveSessionMemory(workspaceDir, chatId, agentId, messages)
  } catch {
    // Save is best-effort, same behavior as sidebar new-chat action.
  }
}

async function runTurn({
  config,
  agent,
  localChatId,
  input,
  onTextDelta
}: {
  config: Config
  agent: AgentConfig
  localChatId: string
  input: string
  onTextDelta?: (delta: string) => Promise<void>
}) {
  const existingMessages = await getChatMessages(localChatId)

  const { messagesWithUser, userMessageId } = appendUserMessage({
    existingMessages,
    input,
    agentId: agent.id
  })

  const assistantMessageId = generateId()
  const requestMessages = appendAssistantPlaceholder({
    messages: messagesWithUser,
    userMessageId,
    assistantMessageId,
    agentId: agent.id
  })

  const result = await runChatTurn({
    config,
    messages: requestMessages,
    chatId: localChatId,
    agentId: agent.id,
    maxSteps: TELEGRAM_MAX_STEPS,
    activeTools: [...TELEGRAM_ALLOWED_TOOLS],
    requestConfirmation: async () => false,
    requestUserAnswer: async () => null,
    onTextDelta
  })

  return result.text
}

function appendUserMessage({
  existingMessages,
  input,
  agentId
}: {
  existingMessages: ChatMessage[]
  input: string
  agentId: string
}) {
  const userMessageId = generateId()
  const userMessage = createUserMessage({
    id: userMessageId,
    input,
    agentId
  })

  if (existingMessages.length === 0) {
    return {
      userMessageId,
      messagesWithUser: [
        createSpecialUserMessage({
          userMessageId,
          agentId
        }),
        userMessage
      ]
    }
  }

  try {
    const { displayedMessages } = getDisplayedMessages(existingMessages)
    const lastMessage = displayedMessages[displayedMessages.length - 1]

    if (!lastMessage) {
      return {
        userMessageId,
        messagesWithUser: [
          createSpecialUserMessage({
            userMessageId,
            agentId
          }),
          userMessage
        ]
      }
    }

    const messagesWithUser = [
      ...existingMessages.map((message) => {
        if (message.id !== lastMessage.id) {
          return message
        }
        return {
          ...message,
          nextMessageId: userMessageId,
          nextMessageIds: [...(message.nextMessageIds ?? []), userMessageId]
        }
      }),
      userMessage
    ]

    return { userMessageId, messagesWithUser }
  } catch {
    return {
      userMessageId,
      messagesWithUser: [
        createSpecialUserMessage({
          userMessageId,
          agentId
        }),
        userMessage
      ]
    }
  }
}

function appendAssistantPlaceholder({
  messages,
  userMessageId,
  assistantMessageId,
  agentId
}: {
  messages: ChatMessage[]
  userMessageId: string
  assistantMessageId: string
  agentId: string
}): ChatMessage[] {
  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    createdAt: Date.now(),
    content: [],
    metadata: {},
    nextMessageIds: [],
    agent: agentId
  }

  return [
    ...messages.map((message) => {
      if (message.id !== userMessageId) {
        return message
      }
      return {
        ...message,
        nextMessageId: assistantMessageId,
        nextMessageIds: [...(message.nextMessageIds ?? []), assistantMessageId]
      }
    }),
    assistantMessage
  ]
}

function splitMessage(
  text: string,
  options: {
    trimChunkEdges?: boolean
  } = {}
): string[] {
  const trimChunkEdges = options.trimChunkEdges ?? true

  if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
    return [text]
  }

  const chunks: string[] = []
  let rest = text
  while (rest.length > 0) {
    if (rest.length <= TELEGRAM_MESSAGE_LIMIT) {
      chunks.push(rest)
      break
    }

    let cut = rest.lastIndexOf("\n", TELEGRAM_MESSAGE_LIMIT)
    if (cut < Math.floor(TELEGRAM_MESSAGE_LIMIT * 0.5)) {
      cut = TELEGRAM_MESSAGE_LIMIT
    }

    const chunk = trimChunkEdges ? rest.slice(0, cut).trim() : rest.slice(0, cut)
    chunks.push(chunk || rest.slice(0, TELEGRAM_MESSAGE_LIMIT))
    rest = trimChunkEdges ? rest.slice(cut).trimStart() : rest.slice(cut)
  }
  return chunks
}

async function sendText(ctx: Context, text: string) {
  const chunks = splitMessage(text)
  for (const chunk of chunks) {
    const markdownChunk = chunk.trim()
    if (!markdownChunk) {
      continue
    }

    try {
      await ctx.reply(markdownChunk, {
        parse_mode: "Markdown"
      })
    } catch (error) {
      if (!isTelegramEntityParseError(error)) {
        throw error
      }
      await ctx.reply(markdownChunk)
    }
  }
}

async function sendPlainText(ctx: Context, text: string) {
  const chunks = splitMessage(text, { trimChunkEdges: false })
  for (const chunk of chunks) {
    if (!chunk) {
      continue
    }
    await ctx.reply(chunk)
  }
}

function isTelegramEntityParseError(error: unknown): boolean {
  if (error instanceof GrammyError) {
    if (error.error_code !== 400) {
      return false
    }
    return error.description.toLowerCase().includes("can't parse entities")
  }

  if (error instanceof Error) {
    return error.message.toLowerCase().includes("can't parse entities")
  }

  return false
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) {
    return 0
  }
  return trimmed.split(/\s+/).length
}

function joinParagraphs(left: string, right: string): string {
  const leftTrimmed = left.trim()
  const rightTrimmed = right.trim()
  if (!leftTrimmed) return rightTrimmed
  if (!rightTrimmed) return leftTrimmed
  return `${leftTrimmed}\n\n${rightTrimmed}`
}

function findSentenceBoundary(text: string, minWords: number): number {
  const sentenceBoundaryRegex = /[.!?](?:["')\]]+)?\s+/g
  let match: RegExpExecArray | null
  while ((match = sentenceBoundaryRegex.exec(text)) !== null) {
    const endIndex = match.index + match[0].length
    const candidate = text.slice(0, endIndex)
    if (countWords(candidate) >= minWords) {
      return endIndex
    }
  }
  return -1
}

function normalizeTextChunk(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

function createTelegramParagraphStreamer({
  minWords,
  onChunk
}: {
  minWords: number
  onChunk: (chunk: string) => Promise<void>
}) {
  let buffer = ""
  let stagedParagraph = ""
  let sentChunkCount = 0
  let sendQueue = Promise.resolve()

  const queueChunk = (chunk: string) => {
    const normalizedChunk = chunk.trim()
    if (!normalizedChunk) {
      return
    }
    sentChunkCount += 1
    sendQueue = sendQueue.then(async () => {
      await onChunk(normalizedChunk)
    })
  }

  const processCompleteParagraphs = () => {
    if (!buffer.includes("\n\n")) {
      return
    }

    const pieces = buffer.split(/\n{2,}/)
    const incompleteTail = pieces.pop() ?? ""
    for (const piece of pieces) {
      const paragraph = piece.trim()
      if (!paragraph) {
        continue
      }

      stagedParagraph = joinParagraphs(stagedParagraph, paragraph)
      if (countWords(stagedParagraph) >= minWords) {
        queueChunk(stagedParagraph)
        stagedParagraph = ""
      }
    }

    buffer = incompleteTail
  }

  const processSentenceFallback = () => {
    while (true) {
      const combined = joinParagraphs(stagedParagraph, buffer)
      if (countWords(combined) < minWords) {
        return
      }

      const sentenceBoundary = findSentenceBoundary(combined, minWords)
      if (sentenceBoundary === -1) {
        return
      }

      const head = combined.slice(0, sentenceBoundary).trim()
      const tail = combined.slice(sentenceBoundary).trimStart()
      if (!head) {
        return
      }
      queueChunk(head)
      stagedParagraph = ""
      buffer = tail
    }
  }

  return {
    async push(delta: string) {
      buffer += normalizeTextChunk(delta)
      processCompleteParagraphs()
      processSentenceFallback()
      await sendQueue
    },
    async flush() {
      const finalChunk = joinParagraphs(stagedParagraph, buffer).trim()
      if (finalChunk) {
        queueChunk(finalChunk)
      }
      stagedParagraph = ""
      buffer = ""
      await sendQueue
    },
    hasSent() {
      return sentChunkCount > 0
    }
  }
}

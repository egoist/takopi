const DEFAULT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

type PendingEntry<T> = {
  resolve: (value: T) => void
  timer: ReturnType<typeof setTimeout>
}

function makeKey(chatId: string, toolCallId: string) {
  return `${chatId}:${toolCallId}`
}

export function createPendingPromiseStore<T>(timeoutValue: T) {
  const pending: Record<string, PendingEntry<T>> = {}

  function waitFor(
    chatId: string,
    toolCallId: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const key = makeKey(chatId, toolCallId)
    return new Promise<T>((resolve) => {
      const cleanup = () => {
        clearTimeout(pending[key]?.timer)
        delete pending[key]
      }

      const timer = setTimeout(() => {
        cleanup()
        resolve(timeoutValue)
      }, DEFAULT_TIMEOUT)

      pending[key] = {
        resolve: (value) => {
          cleanup()
          resolve(value)
        },
        timer,
      }

      signal?.addEventListener(
        "abort",
        () => {
          cleanup()
          resolve(timeoutValue)
        },
        { once: true },
      )
    })
  }

  function cleanupAll(chatId: string): void {
    for (const key of Object.keys(pending)) {
      if (key.startsWith(`${chatId}:`)) {
        const entry = pending[key]
        clearTimeout(entry.timer)
        entry.resolve(timeoutValue)
      }
    }
  }

  function resolve(
    chatId: string,
    toolCallId: string,
    value: T,
  ): boolean {
    const key = makeKey(chatId, toolCallId)
    const entry = pending[key]
    if (!entry) return false

    entry.resolve(value)
    return true
  }

  return { waitFor, cleanupAll, resolve }
}

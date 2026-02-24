import { getConfig } from "./config"
import { syncTelegramBot } from "./telegram"

type StartupGlobal = typeof globalThis & {
  __takopiServerRuntimeInit?: Promise<void>
}

export function initializeServerRuntime(): Promise<void> {
  const startupGlobal = globalThis as StartupGlobal

  if (!startupGlobal.__takopiServerRuntimeInit) {
    startupGlobal.__takopiServerRuntimeInit = bootstrapServerRuntime()
  }

  return startupGlobal.__takopiServerRuntimeInit
}

async function bootstrapServerRuntime() {
  try {
    const config = await getConfig()
    syncTelegramBot(config)
  } catch (error) {
    console.error("[startup] Failed to initialize server runtime:", error)
  }
}

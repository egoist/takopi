import { chatRouter } from "./chat.router"
import { configRouter } from "./config.router"
import { providerRouter } from "./provider.router"

export const router = {
  chat: chatRouter,
  config: configRouter,
  provider: providerRouter
}

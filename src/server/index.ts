import { initializeServerRuntime } from "./lib/startup"
import { createRequestListener } from "@react-router/node"
import polka from "polka"
import sirv from "sirv"
import morgan from "morgan"

const app = polka()

const requestListener = createRequestListener({
  build: () => import("virtual:react-router/server-build"),
  mode: process.env.NODE_ENV
})

let initialized = false

export const onInit = async ({
  viteDevServer
}: {
  viteDevServer?: Awaited<ReturnType<typeof import("vite").createServer>>
} = {}) => {
  if (initialized) return

  initialized = true

  if (viteDevServer) {
    app.use(viteDevServer.middlewares)
  } else {
    app.use(
      "/assets",
      sirv("build/client/assets", {
        immutable: true,
        // 1 year
        maxAge: 365 * 24 * 60 * 60 * 1000
      })
    )
    app.use(morgan("tiny"))
    app.use(sirv("build/client", { maxAge: 60 * 60 * 1000 }))
  }

  await initializeServerRuntime()

  app.use(requestListener)
}

export const onRequest = (req: any, res: any) => {
  return app.handler(req, res)
}

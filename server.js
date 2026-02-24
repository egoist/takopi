// @ts-check
import { createServer } from "http"

const BUILD_PATH = "./build/server/index.js"
const DEVELOPMENT = process.env.NODE_ENV === "development"
const PORT = Number.parseInt(process.env.PORT || "3000")

/** @type {(req: import("http").IncomingMessage, res: import("http").ServerResponse) => Promise<void>} */
let handler

if (DEVELOPMENT) {
  console.log("Starting development server")

  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({
      server: {
        middlewareMode: true
      }
    })
  )

  handler = async (req, res) => {
    const mod = await viteDevServer.ssrLoadModule("./src/server/index.ts", { fixStacktrace: true })
    await mod.onInit({ viteDevServer })

    return await mod.onRequest(req, res)
  }
} else {
  console.log("Starting production server")

  const mod = await import(BUILD_PATH)

  await mod.onInit()

  handler = mod.onRequest
}

const server = createServer(handler)
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})

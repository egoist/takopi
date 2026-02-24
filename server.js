import compression from "compression"
import express from "express"
import morgan from "morgan"

const BUILD_PATH = "./build/server/index.js"
const DEVELOPMENT = process.env.NODE_ENV === "development"
const MODE = DEVELOPMENT ? "development" : "production"
const PORT = Number.parseInt(process.env.PORT || "3000")

const app = express()

app.use(compression())
app.disable("x-powered-by")

if (MODE === "development") {
  console.log("Starting development server")

  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({
      server: {
        middlewareMode: true
      }
    })
  )

  await viteDevServer
    .ssrLoadModule("./src/server/app.ts")
    .then((mod) => mod.initializeServerRuntime())

  app.use(viteDevServer.middlewares)
  app.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule("./src/server/app.ts")
      return await source.app(req, res, next)
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error)
      }
      next(error)
    }
  })
} else {
  console.log("Starting production server")

  const mod = await import(BUILD_PATH)

  await mod.initializeServerRuntime()

  app.use(
    "/assets",
    express.static("build/client/assets", {
      immutable: true,
      maxAge: "1y"
    })
  )
  app.use(morgan("tiny"))
  app.use(express.static("build/client", { maxAge: "1h" }))
  app.use(mod.app)
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})

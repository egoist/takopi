import path from "node:path"
import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { ChildProcess, spawn } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainProcess: ChildProcess | undefined

export default defineConfig({
  build: {
    rollupOptions: {
      input: [path.join(__dirname, "./src/main.ts"), path.join(__dirname, "./src/preload.ts")],
      output: {
        entryFileNames: "[name].js",
        format: "commonjs"
      }
    },
    minify: !process.argv.includes("--watch")
  },
  plugins: [
    {
      enforce: "pre",
      name: "external",
      resolveId(id) {
        if (id[0] !== "." && !path.isAbsolute(id)) {
          return {
            external: true,
            id
          }
        }
      }
    },
    {
      name: "start-main",
      writeBundle() {
        if (mainProcess) {
          mainProcess.kill()
          mainProcess = undefined
        }

        if (process.argv.includes("--watch") && !mainProcess) {
          mainProcess = spawn("pnpm", ["run", "start-desktop"], {
            stdio: "inherit",
            shell: true
          })
        }
      }
    }
  ]
})

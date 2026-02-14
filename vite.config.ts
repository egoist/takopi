import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"
import { build } from "esbuild"
import babel from "vite-plugin-babel"

export default defineConfig((ctx) => {
  return {
    optimizeDeps: {
      exclude: ["@tanstack/react-query"]
    },
    plugins: [
      tsconfigPaths(),
      reactRouter(),
      babel({
        filter: /\.[jt]sx?$/,
        babelConfig: {
          presets: ["@babel/preset-typescript"], // if you use TypeScript
          plugins: [["babel-plugin-react-compiler", {}]]
        }
      }),
      {
        name: "inline-script",

        async transform(code, id, options) {
          if (id.endsWith("?inline-script")) {
            const p = id.replace(/\?.+$/, "")
            const result = await build({
              entryPoints: [p],
              write: false,
              format: "iife",
              globalName: "inlineScriptExports",
              minify: true
            })

            return {
              code: `export default ${JSON.stringify(result.outputFiles[0].text)}`
            }
          }
        }
      },
      tailwindcss()
    ]
  }
})

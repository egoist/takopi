export {} // <-- do not remove

declare global {
  interface Window {
    inlineScriptExports: typeof import("./inline-script")
    __takopi_electron__?: {
      version: string
    }
  }
}

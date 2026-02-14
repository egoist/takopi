import { contextBridge } from "electron"

contextBridge.exposeInMainWorld("__takopi_electron__", {
  version: process.versions.electron
})

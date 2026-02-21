import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import type { Route } from "./+types/api.attachment"
import { getTakopiFilesDir } from "@/server/lib/paths"

const AttachmentQuerySchema = z.object({
  path: z.string().min(1)
})

function toAbsolutePath(value: string): string {
  if (value.startsWith("file://")) {
    return fileURLToPath(value)
  }
  return resolve(value)
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const parsed = AttachmentQuerySchema.safeParse({
    path: url.searchParams.get("path") || ""
  })

  if (!parsed.success) {
    return new Response("Invalid attachment request", { status: 400 })
  }

  const attachmentsDir = resolve(getTakopiFilesDir())
  let requestedPath = ""
  try {
    requestedPath = toAbsolutePath(parsed.data.path)
  } catch {
    return new Response("Invalid path", { status: 400 })
  }
  const isInChatDir =
    requestedPath === attachmentsDir ||
    requestedPath.startsWith(`${attachmentsDir}/`) ||
    requestedPath.startsWith(`${attachmentsDir}\\`)

  if (!isInChatDir) {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const content = await readFile(requestedPath)
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=86400"
      }
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}

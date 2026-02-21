import { mkdir, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import type { Route } from "./+types/api.upload-attachment"
import { getTakopiFilesDir } from "@/server/lib/paths"
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

function sanitizeFilename(value: string): string {
  const name = basename(value)
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment"
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "Missing file" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return new Response(JSON.stringify({ error: "File too large (max 25MB)." }), {
      status: 413,
      headers: { "Content-Type": "application/json" }
    })
  }

  const filesDir = getTakopiFilesDir()
  await mkdir(filesDir, { recursive: true })

  const sanitizedName = sanitizeFilename(file.name)
  const extension = extname(sanitizedName)
  const storedName = `${crypto.randomUUID()}${extension}`
  const absolutePath = join(filesDir, storedName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(absolutePath, buffer)

  return Response.json({
    path: absolutePath,
    mediaType: file.type || "application/octet-stream",
    filename: sanitizedName
  })
}

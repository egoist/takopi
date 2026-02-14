import type { Route } from "./+types/api.openai-oauth.device.start"
import { z } from "zod"
import { getConfig } from "@/server/lib/config"
import { startOpenAIDeviceAuth } from "@/server/lib/openai-oauth"

const RequestBodySchema = z.object({
  providerId: z.string()
})

export async function action({ request }: Route.ActionArgs) {
  const body = RequestBodySchema.parse(await request.json())
  const config = await getConfig()
  const provider = config.providers.find((item) => item.id === body.providerId)

  if (!provider) {
    return Response.json({ error: "Provider not found." }, { status: 404 })
  }

  if (provider.type !== "codex") {
    return Response.json({ error: "OAuth is only supported for Codex providers." }, { status: 400 })
  }

  const result = await startOpenAIDeviceAuth({
    providerId: body.providerId
  })

  return Response.json(result)
}

import type { Route } from "./+types/api.openai-oauth.device.poll"
import { z } from "zod"
import { pollOpenAIDeviceAuth } from "@/server/lib/openai-oauth"

const RequestBodySchema = z.object({
  sessionId: z.string()
})

export async function action({ request }: Route.ActionArgs) {
  const body = RequestBodySchema.parse(await request.json())
  const result = await pollOpenAIDeviceAuth({
    sessionId: body.sessionId
  })
  return Response.json(result)
}

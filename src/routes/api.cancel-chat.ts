import type { Route } from "./+types/api.cancel-chat"
import { z } from "zod"
import { streamControllers } from "@/server/lib/redis"

const CancelChatSchema = z.object({
  id: z.string()
})

export async function action({ request }: Route.ActionArgs) {
  const body = CancelChatSchema.parse(await request.json())

  const controller = streamControllers[body.id]
  if (controller) {
    controller.abort()
    delete streamControllers[body.id]
  }

  return Response.json({ ok: true })
}

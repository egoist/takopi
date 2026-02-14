import type { Route } from "./+types/api.confirm-tool"
import { z } from "zod"
import { resolveConfirmation } from "@/server/lib/tool-confirmations"

const ConfirmToolSchema = z.object({
  chatId: z.string(),
  toolCallId: z.string(),
  approved: z.boolean()
})

export async function action({ request }: Route.ActionArgs) {
  const body = ConfirmToolSchema.parse(await request.json())

  const found = resolveConfirmation(body.chatId, body.toolCallId, body.approved)

  return Response.json({ ok: found })
}

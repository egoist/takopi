import type { Route } from "./+types/api.answer-question"
import { z } from "zod"
import { resolveQuestionAnswer } from "@/server/lib/user-questions"

const AnswerQuestionSchema = z.object({
  chatId: z.string(),
  toolCallId: z.string(),
  answers: z.array(
    z.object({
      question: z.string(),
      selectedOptions: z.array(z.string()),
      customAnswer: z.string().optional()
    })
  )
})

export async function action({ request }: Route.ActionArgs) {
  const body = AnswerQuestionSchema.parse(await request.json())

  const found = resolveQuestionAnswer(body.chatId, body.toolCallId, {
    answers: body.answers
  })

  return Response.json({ ok: found })
}

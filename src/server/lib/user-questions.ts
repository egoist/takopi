import { createPendingPromiseStore } from "./pending-promise"

export type QuestionAnswer = {
  answers: Array<{
    question: string
    selectedOptions: string[]
    customAnswer?: string
  }>
}

const store = createPendingPromiseStore<QuestionAnswer | null>(null)

export const waitForQuestionAnswer = store.waitFor
export const cleanupPendingQuestions = store.cleanupAll
export const resolveQuestionAnswer = store.resolve

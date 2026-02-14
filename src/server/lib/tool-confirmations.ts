import { createPendingPromiseStore } from "./pending-promise"

const store = createPendingPromiseStore<boolean>(false)

export const waitForConfirmation = store.waitFor
export const cleanupPendingConfirmations = store.cleanupAll
export const resolveConfirmation = store.resolve

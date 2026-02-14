import { os } from "@orpc/server"

export const createRPCCOntext = async (request: Request) => {
  return {
    request
  }
}

export type RPCContext = Awaited<ReturnType<typeof createRPCCOntext>>

export const base = os.$context<RPCContext>()

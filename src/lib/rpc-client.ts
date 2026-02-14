import { createORPCClient, onError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import type { router } from "@/server/rpc"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"

const link = new RPCLink({
  url: () => `${location.origin}/api/rpc`,
  headers: () => ({
    authorization: "Bearer"
  }),
  // fetch: <-- provide fetch polyfill fetch if needed
  interceptors: [
    onError((error) => {
      const isAborted = error instanceof Error && error.name === "AbortError"
      if (!isAborted) {
        console.error(error)
      }
    })
  ]
})

// Create a client for your router
export const rpcClient: RouterClient<typeof router> = createORPCClient(link)

export const rpc = createTanstackQueryUtils(rpcClient)

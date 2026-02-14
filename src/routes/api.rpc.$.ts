import { RPCHandler } from "@orpc/server/fetch"
import { onError } from "@orpc/server"
import type { Route } from "./+types/api.rpc.$"
import { router } from "@/server/rpc"
import { createRPCCOntext } from "@/server/rpc/base"

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    })
  ]
})

const routeHandler = async ({ request }: Route.LoaderArgs) => {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: await createRPCCOntext(request)
  })

  return response ?? new Response("Not Found", { status: 404 })
}

export const action = routeHandler

export const loader = routeHandler

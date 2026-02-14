import type { Route } from "./+types/api.resume-chat"
import { streamContext } from "@/server/lib/stream-context"

const streamHeaders = {
  "Transfer-Encoding": "chunked",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache"
}

function errorHandler(error: unknown): string {
  if (error == null) {
    return "unknown error"
  }

  if (typeof error === "string") {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return JSON.stringify(error)
}

export async function loader({ request }: Route.LoaderArgs) {
  const { searchParams } = new URL(request.url)

  try {
    const chatId = searchParams.get("id")
    if (!chatId) {
      return new Response("No chat id", { status: 400 })
    }

    const resumeAt = searchParams.get("resumeAt")
    const stream = await streamContext.resumeExistingStream(
      chatId,
      resumeAt ? parseInt(resumeAt) : undefined
    )

    if (!stream) {
      return new Response("Stream is already done", {
        status: 200
      })
    }

    request.signal.addEventListener("abort", (e) => {
      console.log("ABORT in resumable stream!!!", e)
    })

    return new Response(stream, {
      headers: {
        ...streamHeaders
      }
    })
  } catch (error) {
    return new Response(errorHandler(error), {
      status: 500
    })
  }
}

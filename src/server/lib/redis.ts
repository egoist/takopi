import RedisMock from "ioredis-mock"

export const redisPub = new RedisMock()
export const redisSub = new RedisMock()

export const streamControllers: { [streamId: string]: AbortController } = {}

// Subscribe to cancel events
redisSub.subscribe("cancel-chat-stream")

redisSub.on("message", (channel: string, message: string) => {
  if (channel === "cancel-chat-stream") {
    const controller = streamControllers[message]
    if (controller) {
      controller.abort()
    }
  }
})

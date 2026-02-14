import { createResumableStreamContext } from "resumable-stream/ioredis"
import { redisPub, redisSub } from "./redis"

export const streamContext = createResumableStreamContext({
  waitUntil: null,
  publisher: redisPub,
  subscriber: redisSub
})

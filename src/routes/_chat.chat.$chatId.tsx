import { ChatUI } from "@/components/chat-ui"
import { useParams } from "react-router"

export default function Component() {
  const { chatId } = useParams()

  return <ChatUI key={chatId} />
}

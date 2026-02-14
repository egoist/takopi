import { Outlet, useParams } from "react-router"
import { ChatSidebar } from "@/components/chat-sidebar"
import { FilesSidebar } from "@/components/files-sidebar"
import { useChatQuery, useConfigQuery } from "@/lib/queries"

export default function Component() {
  const params = useParams()
  const chatId = params.chatId

  const { data: config } = useConfigQuery()
  const chatQuery = useChatQuery(chatId)
  const defaultAgentId = config?.defaultAgent
  const agentId = chatQuery.data?.agent || defaultAgentId

  return (
    <>
      <div className="flex h-dvh">
        <ChatSidebar activeChatId={chatId} />
        <div className="grow">
          <Outlet />
        </div>
        <FilesSidebar agentId={agentId} />
      </div>
    </>
  )
}

import { ModelSelect } from "@/components/model-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useConfigQuery, useUpdateConfigMutation } from "@/lib/queries"
import { rpc, rpcClient } from "@/lib/rpc-client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TelegramConfig, WebFetchProvider, WebSearchProvider } from "@/types/config"
import type { TelegramPendingUser } from "@/types/telegram"

export default function GeneralSettings() {
  const { data: config } = useConfigQuery()
  const updateConfig = useUpdateConfigMutation()
  const queryClient = useQueryClient()
  const pendingUsersQuery = useQuery(rpc.config.getTelegramPendingUsers.queryOptions())

  const webSearchProvider = config?.webSearchProvider
  const telegramConfig = config?.telegram
  const telegramEnabled = telegramConfig?.enabled === true
  const telegramPendingUsers = pendingUsersQuery.data ?? []
  const telegramApprovedUserIds = telegramConfig?.approvedUserIds ?? []

  const approveTelegramUserMutation = useMutation({
    mutationFn: async (input: { userId: number }) => {
      return rpcClient.config.approveTelegramUser(input)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rpc.config.getConfig.queryKey() }),
        queryClient.invalidateQueries({ queryKey: rpc.config.getTelegramPendingUsers.queryKey() })
      ])
    }
  })

  const rejectTelegramUserMutation = useMutation({
    mutationFn: async (input: { userId: number }) => {
      return rpcClient.config.rejectTelegramUser(input)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rpc.config.getTelegramPendingUsers.queryKey() })
    }
  })

  const updateTelegramConfig = (updater: (current: TelegramConfig) => TelegramConfig) => {
    const current = config?.telegram ?? {}
    updateConfig.mutate({
      telegram: updater(current)
    })
  }

  const approveTelegramUser = (user: TelegramPendingUser) => {
    approveTelegramUserMutation.mutate({ userId: user.id })
  }

  const rejectTelegramUser = (user: TelegramPendingUser) => {
    rejectTelegramUserMutation.mutate({ userId: user.id })
  }

  const revokeTelegramUser = (userId: number) => {
    updateTelegramConfig((current) => ({
      ...current,
      approvedUserIds: (current.approvedUserIds ?? []).filter((id) => id !== userId)
    }))
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">General Settings</h2>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="embedding-model">Embedding Model</Label>
          <p className="text-sm text-muted-foreground">
            Used for semantic search in memory indexing.
          </p>
          <div>
            <ModelSelect
              id="embedding-model"
              value={config?.embeddingModel ?? ""}
              modelType="embedding"
              onValueChange={(value) => {
                updateConfig.mutate({ embeddingModel: value })
              }}
              placeholder="Select an embedding model"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Web Search</Label>
            <p className="text-sm text-muted-foreground">
              Configure the web search provider for the WebSearch and WebFetch tools.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="web-search-provider">Provider</Label>
              <div>
                <NativeSelect
                  id="web-search-provider"
                  value={webSearchProvider ?? ""}
                  onChange={(e) => {
                    const provider = e.target.value as WebSearchProvider | ""
                    updateConfig.mutate({
                      webSearchProvider: provider || undefined
                    })
                  }}
                >
                  <NativeSelectOption value="">None</NativeSelectOption>
                  <NativeSelectOption value="exa">Exa</NativeSelectOption>
                  <NativeSelectOption value="braveSearch">Brave Search</NativeSelectOption>
                  <NativeSelectOption value="command">Command</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
            {webSearchProvider === "exa" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="exa-api-key">Exa API Key</Label>
                <Input
                  id="exa-api-key"
                  isPassword
                  value={config?.exa?.apiKey ?? ""}
                  onChange={(e) => {
                    updateConfig.mutate({
                      exa: {
                        ...config?.exa,
                        apiKey: e.target.value
                      }
                    })
                  }}
                  placeholder="Enter your Exa API key"
                />
              </div>
            )}
            {webSearchProvider === "braveSearch" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="brave-api-key">Brave Search API Key</Label>
                <Input
                  id="brave-api-key"
                  isPassword
                  value={config?.braveSearch?.apiKey ?? ""}
                  onChange={(e) => {
                    updateConfig.mutate({
                      braveSearch: {
                        ...config?.braveSearch,
                        apiKey: e.target.value
                      }
                    })
                  }}
                  placeholder="Enter your Brave Search API key"
                />
              </div>
            )}
            {webSearchProvider === "command" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="web-search-command">Command</Label>
                <p className="text-sm text-muted-foreground">
                  Use <code className="text-xs bg-muted px-1 py-0.5 rounded">$QUERY</code> as a
                  placeholder for the search query.
                </p>
                <Input
                  id="web-search-command"
                  value={config?.webSearchCommand ?? ""}
                  onChange={(e) => {
                    updateConfig.mutate({
                      webSearchCommand: e.target.value
                    })
                  }}
                  placeholder='e.g. curl "https://api.example.com/search?q=$QUERY"'
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Web Fetch</Label>
            <p className="text-sm text-muted-foreground">
              Configure how to fetch web page content for the WebFetch tool.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="web-fetch-provider">Provider</Label>
              <div>
                <NativeSelect
                  id="web-fetch-provider"
                  value={config?.webFetchProvider ?? ""}
                  onChange={(e) => {
                    const provider = e.target.value as WebFetchProvider | ""
                    updateConfig.mutate({
                      webFetchProvider: provider || undefined
                    })
                  }}
                >
                  <NativeSelectOption value="">None</NativeSelectOption>
                  <NativeSelectOption value="exa">Exa</NativeSelectOption>
                  <NativeSelectOption value="fetch">Fetch</NativeSelectOption>
                  <NativeSelectOption value="command">Command</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
            {config?.webFetchProvider === "exa" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="exa-api-key-fetch">Exa API Key</Label>
                <Input
                  id="exa-api-key-fetch"
                  isPassword
                  value={config?.exa?.apiKey ?? ""}
                  onChange={(e) => {
                    updateConfig.mutate({
                      exa: {
                        ...config?.exa,
                        apiKey: e.target.value
                      }
                    })
                  }}
                  placeholder="Enter your Exa API key"
                />
              </div>
            )}
            {config?.webFetchProvider === "command" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="web-fetch-command">Command</Label>
                <p className="text-sm text-muted-foreground">
                  Use <code className="text-xs bg-muted px-1 py-0.5 rounded">$URL</code> as a
                  placeholder for the URL.
                </p>
                <Input
                  id="web-fetch-command"
                  value={config?.webFetchCommand ?? ""}
                  onChange={(e) => {
                    updateConfig.mutate({
                      webFetchCommand: e.target.value
                    })
                  }}
                  placeholder='e.g. curl -s "$URL"'
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Telegram Bot</Label>
            <p className="text-sm text-muted-foreground">
              Connect a Telegram bot token so you can chat with your Takopi agent in Telegram.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="telegram-enabled"
                checked={telegramEnabled}
                onCheckedChange={(checked) => {
                  updateTelegramConfig((current) => ({
                    ...current,
                    enabled: checked === true
                  }))
                }}
              />
              <Label htmlFor="telegram-enabled">Enable Telegram integration</Label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="telegram-bot-token">Bot Token</Label>
              <Input
                id="telegram-bot-token"
                isPassword
                value={telegramConfig?.botToken ?? ""}
                onChange={(e) => {
                  updateTelegramConfig((current) => ({
                    ...current,
                    botToken: e.target.value
                  }))
                }}
                placeholder="123456789:AA..."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="telegram-agent">Agent</Label>
              <div>
                <NativeSelect
                  id="telegram-agent"
                  value={telegramConfig?.agentId ?? ""}
                  onChange={(e) => {
                    const agentId = e.target.value || undefined
                    updateTelegramConfig((current) => ({
                      ...current,
                      agentId
                    }))
                  }}
                >
                  <NativeSelectOption value="">Use app default agent</NativeSelectOption>
                  {(config?.agents || []).map((agent) => (
                    <NativeSelectOption key={agent.id} value={agent.id}>
                      {agent.name || agent.id}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <p className="text-sm text-muted-foreground">
                Commands: <code className="text-xs bg-muted px-1 py-0.5 rounded">/new</code> to
                reset chat.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Pending Approvals</Label>
              {pendingUsersQuery.isFetching && telegramPendingUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading pending users...</p>
              ) : telegramPendingUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending Telegram users.</p>
              ) : (
                <div className="space-y-2">
                  {telegramPendingUsers.map((user) => (
                    <div
                      key={user.id}
                      className="rounded-md border bg-card px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {user.firstName || user.lastName
                            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                            : "Unknown User"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          id: {user.id}
                          {user.username ? ` • @${user.username}` : ""}
                          {` • requested ${new Date(user.requestedAt).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          disabled={approveTelegramUserMutation.isPending}
                          onClick={() => approveTelegramUser(user)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rejectTelegramUserMutation.isPending}
                          onClick={() => rejectTelegramUser(user)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Approved Users</Label>
              {telegramApprovedUserIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved Telegram users yet.</p>
              ) : (
                <div className="space-y-2">
                  {telegramApprovedUserIds.map((userId) => (
                    <div
                      key={userId}
                      className="rounded-md border bg-card px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <p className="text-sm min-w-0 truncate">id: {userId}</p>
                      <Button size="sm" variant="outline" onClick={() => revokeTelegramUser(userId)}>
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

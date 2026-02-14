import { ModelSelect } from "@/components/model-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useConfigQuery, useUpdateConfigMutation } from "@/lib/queries"
import type { WebFetchProvider, WebSearchProvider } from "@/types/config"

export default function GeneralSettings() {
  const { data: config } = useConfigQuery()
  const updateConfig = useUpdateConfigMutation()

  const webSearchProvider = config?.webSearchProvider

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
      </div>
    </div>
  )
}

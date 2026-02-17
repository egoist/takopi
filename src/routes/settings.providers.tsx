import { useState } from "react"
import { useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import { Plus, Trash2, ListPlus, LogIn, Copy, Check } from "lucide-react"
import {
  PROVIDERS,
  getProviderDefaultBaseUrl,
  getProviderInfo,
  isOAuthProvider
} from "@/lib/providers"
import type { ProviderConfig, ModelConfig } from "@/types/config"
import { ModelSelectionDialog } from "@/components/model-selection-dialog"
import { useConfigQuery, useUpdateConfigMutation } from "@/lib/queries"
import { TabbedSettings } from "@/components/tabbed-settings"

type ProviderOption = { value: ProviderConfig["type"]; label: string }

type OpenAIDeviceStartResponse = {
  sessionId: string
  verificationUrl: string
  userCode: string
  intervalMs: number
}

type OpenAIDevicePollResponse =
  | { status: "pending"; intervalMs: number }
  | {
      status: "success"
      token: {
        accessToken: string
        refreshToken?: string
        expiresAt?: number
        accountId?: string
      }
    }
  | { status: "error"; error: string }

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function getModelType(modelId: string): "chat" | "embedding" {
  return modelId.toLowerCase().includes("embedding") ? "embedding" : "chat"
}

function AddProviderMenu({
  options,
  onSelect,
  align,
  className
}: {
  options: ProviderOption[]
  onSelect: (type: ProviderConfig["type"]) => void
  align: "start" | "end"
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className={className}>
            <Plus className="h-4 w-4 mr-1" />
            Add Provider
          </Button>
        }
      />
      <DropdownMenuContent align={align}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onSelect(option.value)
              setOpen(false)
            }}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function ProvidersSettings() {
  const { data: config } = useConfigQuery()
  const updateConfigMutation = useUpdateConfigMutation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null)
  const [oauthBusyProviderId, setOauthBusyProviderId] = useState<string | null>(null)
  const [openAIDeviceCode, setOpenAIDeviceCode] = useState<{
    providerId: string
    code: string
    verificationUrl: string
  } | null>(null)
  const [copiedDeviceCodeProviderId, setCopiedDeviceCodeProviderId] = useState<string | null>(null)

  const providers: ProviderConfig[] = config?.providers || []

  const providerOptions: ProviderOption[] = PROVIDERS.map((p) => ({
    value: p.type,
    label: p.name
  }))

  const updateProviderAtIndex = (
    providerIndex: number,
    updater: (provider: ProviderConfig) => ProviderConfig
  ) => {
    const updatedProviders = providers.map((provider, currentIndex) =>
      currentIndex === providerIndex ? updater(provider) : provider
    )

    updateConfigMutation.mutate({
      providers: updatedProviders
    })
  }

  const handleAddProvider = (type: ProviderConfig["type"]) => {
    const providerInfo = getProviderInfo(type)
    const newProvider: ProviderConfig = {
      id: `provider-${Date.now()}`,
      name: providerInfo?.name || "",
      type,
      baseUrl: "",
      apiKey: "",
      authType: isOAuthProvider(type) ? "oauth" : "apiKey",
      models: []
    }
    const updatedProviders = [...providers, newProvider]
    setSearchParams({ id: newProvider.id })
    updateConfigMutation.mutate({
      providers: updatedProviders
    })
  }

  const handleProviderChange = (
    providerIndex: number,
    field: keyof ProviderConfig,
    value: string
  ) => {
    updateProviderAtIndex(providerIndex, (provider) => ({
      ...provider,
      [field]: value
    }))
  }

  const startOpenAIOAuth = async ({
    providerId,
    providerIndex
  }: {
    providerId: string
    providerIndex: number
  }) => {
    if (oauthBusyProviderId) return

    setOauthBusyProviderId(providerId)

    try {
      const startResponse = await fetch("/api/openai-oauth/device/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ providerId })
      })

      if (!startResponse.ok) {
        const startError = (await startResponse.json()) as { error?: string }
        throw new Error(startError.error || "Failed to start OpenAI OAuth login.")
      }

      const startData = (await startResponse.json()) as OpenAIDeviceStartResponse
      window.open(
        startData.verificationUrl,
        "takopi-openai-oauth-device",
        "popup=yes,width=540,height=700,resizable=yes,scrollbars=yes"
      )
      setOpenAIDeviceCode({
        providerId,
        code: startData.userCode,
        verificationUrl: startData.verificationUrl
      })

      const deadline = Date.now() + 5 * 60 * 1000
      let pollResult: OpenAIDevicePollResponse | null = null
      while (Date.now() < deadline) {
        const pollResponse = await fetch("/api/openai-oauth/device/poll", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ sessionId: startData.sessionId })
        })

        if (!pollResponse.ok) {
          const pollError = (await pollResponse.json()) as { error?: string }
          throw new Error(pollError.error || "Failed to check OpenAI OAuth status.")
        }

        pollResult = (await pollResponse.json()) as OpenAIDevicePollResponse
        if (pollResult.status === "pending") {
          await sleep(startData.intervalMs)
          continue
        }
        break
      }

      if (!pollResult || pollResult.status === "pending") {
        throw new Error("Timed out waiting for OpenAI OAuth completion.")
      }

      if (pollResult.status === "error") {
        throw new Error(pollResult.error)
      }

      const accessToken = pollResult.token.accessToken

      updateProviderAtIndex(providerIndex, (provider) => ({
        ...provider,
        authType: "oauth",
        oauth: {
          provider: "codex",
          accessToken,
          refreshToken: pollResult.token.refreshToken,
          expiresAt: pollResult.token.expiresAt,
          accountId: pollResult.token.accountId
        }
      }))
      setOpenAIDeviceCode((current) => (current?.providerId === providerId ? null : current))
    } catch (oauthError) {
      const message =
        oauthError instanceof Error ? oauthError.message : "Failed to complete OpenAI OAuth login."
      window.alert(message)
      setOpenAIDeviceCode((current) => (current?.providerId === providerId ? null : current))
    } finally {
      setOauthBusyProviderId((currentProviderId) =>
        currentProviderId === providerId ? null : currentProviderId
      )
    }
  }

  const handleCopyDeviceCode = async ({ providerId, code }: { providerId: string; code: string }) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedDeviceCodeProviderId(providerId)
      window.setTimeout(() => {
        setCopiedDeviceCodeProviderId((currentProviderId) =>
          currentProviderId === providerId ? null : currentProviderId
        )
      }, 1200)
    } catch {
      window.alert("Failed to copy code. Please copy it manually.")
    }
  }

  const handleEditId = (providerIndex: number) => {
    const provider = providers[providerIndex]
    const newId = window.prompt("Enter new provider ID:", provider.id)

    if (newId && newId.trim() && newId !== provider.id) {
      // Update URL if this provider is active
      if (searchParams.get("id") === provider.id) {
        setSearchParams({ id: newId })
      }

      // Update the provider ID
      const updatedProviders = providers.map((p, i) =>
        i === providerIndex ? { ...p, id: newId } : p
      )
      updateConfigMutation.mutate({
        providers: updatedProviders
      })
    }
  }

  const handleOpenModelDialog = (provider: ProviderConfig) => {
    setSelectedProvider(provider)
    setModelDialogOpen(true)
  }

  const handleModelsSelected = (selectedModels: ModelConfig[]) => {
    if (selectedProvider) {
      const normalizedModels = selectedModels.map((model) => ({
        ...model,
        type: model.type ?? getModelType(model.id)
      }))
      const updatedProviders = providers.map((p) =>
        p.id === selectedProvider.id ? { ...p, models: normalizedModels } : p
      )
      updateConfigMutation.mutate({
        providers: updatedProviders
      })
    }
  }

  const handleRemoveModel = (providerId: string, modelId: string) => {
    const updatedProviders = providers.map((p) =>
      p.id === providerId ? { ...p, models: (p.models || []).filter((m) => m.id !== modelId) } : p
    )
    updateConfigMutation.mutate({
      providers: updatedProviders
    })
  }

  const handleRemoveProvider = (providerId: string) => {
    const updatedProviders = providers.filter((p) => p.id !== providerId)

    // If the removed provider was active, switch to another tab
    if (searchParams.get("id") === providerId && updatedProviders.length > 0) {
      setSearchParams({ id: updatedProviders[0].id })
    }

    updateConfigMutation.mutate({
      providers: updatedProviders
    })
  }

  const getProviderLabel = (provider: ProviderConfig) => {
    if (provider.name && provider.name.trim()) {
      return provider.name
    }
    const providerInfo = getProviderInfo(provider.type)
    const typeName = providerInfo ? providerInfo.name : provider.type
    const index = providers.filter((p) => p.type === provider.type).indexOf(provider) + 1
    const sameTypeCount = providers.filter((p) => p.type === provider.type).length
    return sameTypeCount > 1 ? `${typeName} ${index}` : typeName
  }

  if (!config) {
    return null
  }

  const tabs = providers.map((provider) => ({
    id: provider.id,
    label: getProviderLabel(provider)
  }))

  return (
    <>
      <TabbedSettings
        tabs={tabs}
        addButton={
          <AddProviderMenu
            options={providerOptions}
            onSelect={handleAddProvider}
            align="start"
            className="w-full"
          />
        }
        onRemoveTab={handleRemoveProvider}
      >
        {(activeTab) =>
          providers.map(
            (provider, providerIndex) =>
              activeTab === provider.id && (
                <div key={provider.id}>
                  <div className="mb-4">
                    <div className="flex gap-2 items-center">
                      <h2 className="text-lg font-semibold">{getProviderLabel(provider)}</h2>
                      <Button
                        variant="outline"
                        size="xs"
                        className="h-6 rounded-sm"
                        onClick={() => handleEditId(providerIndex)}
                      >
                        <span>{provider.id}</span>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor={`${provider.id}-name`}>Provider Name (Optional)</Label>
                      <Input
                        id={`${provider.id}-name`}
                        type="text"
                        placeholder="e.g., My OpenAI Account"
                        value={provider.name || ""}
                        onChange={(e) =>
                          handleProviderChange(providerIndex, "name", e.target.value)
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Give this provider a custom name to easily identify it.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Provider Type</Label>
                      <span>
                        {getProviderInfo(provider.type)?.name || provider.type}
                      </span>
                    </div>

                    <div className="grid gap-2">
                      <Label>Authentication</Label>
                      <div className="rounded-md border p-3 space-y-3">
                        {isOAuthProvider(provider.type) ? (
                          <>
                            <p className="text-sm text-muted-foreground">OAuth only</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={oauthBusyProviderId === provider.id}
                                onClick={() =>
                                  startOpenAIOAuth({
                                    providerId: provider.id,
                                    providerIndex
                                  })
                                }
                              >
                                <LogIn className="h-4 w-4 mr-1" />
                                {oauthBusyProviderId === provider.id ? "Signing in..." : "Sign in with ChatGPT"}
                              </Button>
                              {provider.oauth && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    updateProviderAtIndex(providerIndex, (currentProvider) => ({
                                      ...currentProvider,
                                      oauth: undefined
                                    }))
                                  }
                                >
                                  Disconnect OAuth
                                </Button>
                              )}
                            </div>

                            {provider.oauth && (
                              <p className="text-sm text-muted-foreground">
                                Connected
                                {provider.oauth.accountId ? ` as ${provider.oauth.accountId}` : ""}.
                                {provider.oauth.expiresAt
                                  ? ` Expires at ${new Date(provider.oauth.expiresAt).toLocaleString()}.`
                                  : ""}
                              </p>
                            )}

                            {openAIDeviceCode?.providerId === provider.id &&
                              oauthBusyProviderId === provider.id && (
                                <div className="space-y-2 text-sm text-muted-foreground">
                                  <p>Enter this code in OpenAI:</p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <code className="rounded border bg-muted px-2 py-1 font-mono">
                                      {openAIDeviceCode.code}
                                    </code>
                                    <Button
                                      variant="outline"
                                      size="xs"
                                      className="h-7"
                                      onClick={() =>
                                        handleCopyDeviceCode({
                                          providerId: provider.id,
                                          code: openAIDeviceCode.code
                                        })
                                      }
                                    >
                                      {copiedDeviceCodeProviderId === provider.id ? (
                                        <Check className="h-3.5 w-3.5 mr-1" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5 mr-1" />
                                      )}
                                      {copiedDeviceCodeProviderId === provider.id ? "Copied" : "Copy Code"}
                                    </Button>
                                    <a
                                      href={openAIDeviceCode.verificationUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline"
                                    >
                                      Open verification page
                                    </a>
                                  </div>
                                </div>
                              )}
                          </>
                        ) : (
                          <div className="grid gap-2">
                            <Label htmlFor={`${provider.id}-api-key`}>
                              API Key
                            </Label>
                            <Input
                              id={`${provider.id}-api-key`}
                              isPassword
                              placeholder="Enter API key"
                              value={provider.apiKey || ""}
                              onChange={(e) =>
                                handleProviderChange(providerIndex, "apiKey", e.target.value)
                              }
                            />
                          </div>
                        )}

                        <div className="grid gap-2">
                          <Label htmlFor={`${provider.id}-base-url`}>Base URL (Optional)</Label>
                          <Input
                            id={`${provider.id}-base-url`}
                            type="url"
                            placeholder={getProviderDefaultBaseUrl(provider.type)}
                            value={provider.baseUrl || ""}
                            onChange={(e) =>
                              handleProviderChange(providerIndex, "baseUrl", e.target.value)
                            }
                          />
                          <p className="text-sm text-muted-foreground">
                            Leave empty to use the default endpoint. Useful for proxies.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <div className="flex justify-between items-center">
                        <Label>Models ({provider.models?.length || 0})</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenModelDialog(provider)}
                        >
                          <ListPlus className="h-4 w-4 mr-1" />
                          Select Models
                        </Button>
                      </div>
                      {provider.models && provider.models.length > 0 ? (
                        <div className="border rounded-md divide-y overflow-auto">
                          {provider.models.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between p-2 hover:bg-muted/50"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{m.name}</div>
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="text-xs text-muted-foreground truncate">
                                    {m.id}
                                  </div>
                                  <span className="inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {m.type ?? "chat"}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                                onClick={() => handleRemoveModel(provider.id, m.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                          No models selected. Click "Select Models" to add models.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
          )
        }
      </TabbedSettings>

      {selectedProvider && (
        <ModelSelectionDialog
          key={selectedProvider.id}
          open={modelDialogOpen}
          onOpenChange={setModelDialogOpen}
          selectedProvider={selectedProvider}
          onConfirm={handleModelsSelected}
        />
      )}
    </>
  )
}

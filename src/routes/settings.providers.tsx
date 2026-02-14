import { useState } from "react"
import { useSearchParams } from "react-router"
import { debounce } from "perfect-debounce"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import { Plus, Trash2, ListPlus } from "lucide-react"
import { PROVIDERS, type ProviderType } from "@/lib/providers"
import type { ProviderConfig, ModelConfig } from "@/types/config"
import { ModelSelectionDialog } from "@/components/model-selection-dialog"
import { useConfigQuery, useUpdateConfigMutation } from "@/lib/queries"
import { TabbedSettings } from "@/components/tabbed-settings"

type ProviderOption = { value: ProviderConfig["type"]; label: string }

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
  const [selectedProvider, setSelectedProvider] = useState<{
    id: string
    type: ProviderType
    currentModels: ModelConfig[]
  } | null>(null)

  const providers: ProviderConfig[] = config?.providers || []

  const providerOptions: ProviderOption[] = PROVIDERS.map((p) => ({
    value: p.type,
    label: p.name
  }))

  const debouncedSave = debounce(updateConfigMutation.mutate, 1000)

  const handleAddProvider = (type: ProviderConfig["type"]) => {
    const providerInfo = PROVIDERS.find((p) => p.type === type)
    const newProvider: ProviderConfig = {
      id: `provider-${Date.now()}`,
      name: providerInfo?.name || "",
      type,
      baseUrl: "",
      apiKey: "",
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
    const updatedProviders = providers.map((p, i) =>
      i === providerIndex ? { ...p, [field]: value } : p
    )

    updateConfigMutation.mutate({
      providers: updatedProviders
    })
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

  const handleOpenModelDialog = (providerId: string, providerType: ProviderType) => {
    const provider = providers.find((p) => p.id === providerId)
    if (provider) {
      setSelectedProvider({
        id: providerId,
        type: providerType,
        currentModels: provider.models || []
      })
      setModelDialogOpen(true)
    }
  }

  const handleModelsSelected = (selectedModels: ModelConfig[]) => {
    if (selectedProvider) {
      const updatedProviders = providers.map((p) =>
        p.id === selectedProvider.id ? { ...p, models: selectedModels } : p
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
    const providerInfo = PROVIDERS.find((p) => p.type === provider.type)
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
                        {PROVIDERS.find((p) => p.type === provider.type)?.name || provider.type}
                      </span>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor={`${provider.id}-api-key`}>API Key</Label>
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

                    <div className="grid gap-2">
                      <Label htmlFor={`${provider.id}-base-url`}>Base URL (Optional)</Label>
                      <Input
                        id={`${provider.id}-base-url`}
                        type="url"
                        placeholder={
                          provider.type === "openai"
                            ? "https://api.openai.com/v1"
                            : provider.type === "anthropic"
                              ? "https://api.anthropic.com/v1"
                              : provider.type === "deepseek"
                                ? "https://api.deepseek.com/v1"
                                : provider.type === "openrouter"
                                  ? "https://openrouter.ai/api/v1"
                                  : provider.type === "opencode"
                                    ? "https://api.opencode.ai/v1"
                                    : provider.type === "vercel"
                                      ? "https://ai-gateway.vercel.sh/v3/ai"
                                      : "https://api.z.ai/api/paas/v4"
                        }
                        value={provider.baseUrl || ""}
                        onChange={(e) =>
                          handleProviderChange(providerIndex, "baseUrl", e.target.value)
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Leave empty to use the default endpoint. Useful for proxies.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <div className="flex justify-between items-center">
                        <Label>Models ({provider.models?.length || 0})</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenModelDialog(provider.id, provider.type)}
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
                                <div className="text-xs text-muted-foreground truncate">{m.id}</div>
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
          open={modelDialogOpen}
          onOpenChange={setModelDialogOpen}
          providerType={selectedProvider.type}
          currentModels={selectedProvider.currentModels}
          onConfirm={handleModelsSelected}
        />
      )}
    </>
  )
}

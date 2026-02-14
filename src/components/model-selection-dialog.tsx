import React, { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { rpcClient } from "@/lib/rpc-client"
import { PROVIDERS, type ProviderType } from "@/lib/providers"
import type { ModelConfig } from "@/types/config"
import { RefreshCw } from "lucide-react"

interface ModelSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerType: ProviderType
  currentModels: ModelConfig[]
  onConfirm: (selectedModels: ModelConfig[]) => void
}

export function ModelSelectionDialog({
  open,
  onOpenChange,
  providerType,
  currentModels,
  onConfirm
}: ModelSelectionDialogProps) {
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([])
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (open) {
      fetchModels()
      // Pre-select currently configured models
      setSelectedModelIds(new Set(currentModels.map((m) => m.id)))
      setSearchQuery("")
    }
  }, [open, providerType])

  const fetchModels = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await rpcClient.provider.fetchModelsFromAPI({ providerType })
      setAvailableModels(result.models)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch models")
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleModel = (modelId: string) => {
    const newSelected = new Set(selectedModelIds)
    if (newSelected.has(modelId)) {
      newSelected.delete(modelId)
    } else {
      newSelected.add(modelId)
    }
    setSelectedModelIds(newSelected)
  }

  const handleConfirm = () => {
    const selectedModels = availableModels.filter((m) => selectedModelIds.has(m.id))
    onConfirm(selectedModels)
    onOpenChange(false)
  }

  const handleSelectAll = () => {
    const newSelected = new Set(selectedModelIds)
    filteredModels.forEach((m) => newSelected.add(m.id))
    setSelectedModelIds(newSelected)
  }

  const handleDeselectAll = () => {
    const newSelected = new Set(selectedModelIds)
    filteredModels.forEach((m) => newSelected.delete(m.id))
    setSelectedModelIds(newSelected)
  }

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return availableModels
    const query = searchQuery.toLowerCase()
    return availableModels.filter(
      (model) => model.name.toLowerCase().includes(query) || model.id.toLowerCase().includes(query)
    )
  }, [availableModels, searchQuery])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Select Models</DialogTitle>
          <DialogDescription>
            Choose which models to add for{" "}
            {PROVIDERS.find((p) => p.type === providerType)?.name || providerType}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 mr-2" />
              <span>Loading models...</span>
            </div>
          )}

          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

          {!isLoading && !error && availableModels.length > 0 && (
            <>
              <div className="mb-4">
                <Input
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                  Deselect All
                </Button>
                <div className="ml-auto text-sm text-muted-foreground">
                  {selectedModelIds.size} of {availableModels.length} selected
                </div>
              </div>

              <div className="border rounded-md max-h-[400px] overflow-auto">
                <div className="p-4 space-y-3">
                  {filteredModels.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-4">
                      No models found matching "{searchQuery}"
                    </div>
                  ) : (
                    filteredModels.map((model) => (
                      <div key={model.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={model.id}
                          checked={selectedModelIds.has(model.id)}
                          onCheckedChange={() => handleToggleModel(model.id)}
                        />
                        <Label
                          htmlFor={model.id}
                          className="flex-1 cursor-pointer text-sm font-normal"
                        >
                          <div className="font-medium">{model.name}</div>
                          <div className="text-xs text-muted-foreground">{model.id}</div>
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || selectedModelIds.size === 0}>
            Add Selected Models
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

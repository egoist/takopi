import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { useState, useMemo, useRef, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useConfigQuery } from "@/lib/queries"
import { getProviderInfo } from "@/lib/providers"
import type { ProviderConfig } from "@/types/config"

interface ModelSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  id?: string
}

interface ModelItem {
  value: string
  label: string
  providerId: string
  providerLabel: string
}

interface ModelSelectItemProps {
  model: ModelItem
  globalIndex: number
  isSelected: boolean
  isHighlighted: boolean
  onSelect: (value: string) => void
  onHighlight: (index: number) => void
}

function ModelSelectItem({
  model,
  globalIndex,
  isSelected,
  isHighlighted,
  onSelect,
  onHighlight
}: ModelSelectItemProps) {
  return (
    <button
      data-index={globalIndex}
      onClick={() => onSelect(model.value)}
      onMouseEnter={() => onHighlight(globalIndex)}
      className={cn(
        "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
        isHighlighted && "bg-accent text-accent-foreground",
        !isHighlighted && "hover:bg-accent/50"
      )}
    >
      <span>{model.label}</span>
      {isSelected && <Check className="h-4 w-4" />}
    </button>
  )
}

export function ModelSelect({
  value,
  onValueChange,
  placeholder = "Select a model",
  id
}: ModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const { data: config } = useConfigQuery()
  const providers = (config?.providers || []).filter((p) => p.models && p.models.length > 0)

  const getProviderLabel = (provider: ProviderConfig) => {
    if (provider.name && provider.name.trim()) {
      return provider.name
    }
    return getProviderInfo(provider.type)?.name ?? provider.type
  }

  const allModels = useMemo(() => {
    const models: ModelItem[] = []
    providers.forEach((provider) => {
      provider.models?.forEach((model) => {
        models.push({
          value: `${provider.id}/${model.id}`,
          label: model.name,
          providerId: provider.id,
          providerLabel: getProviderLabel(provider)
        })
      })
    })
    return models
  }, [providers])

  const filteredModels = useMemo(() => {
    if (!search.trim()) return allModels
    const searchLower = search.toLowerCase()
    return allModels.filter(
      (model) =>
        model.label.toLowerCase().includes(searchLower) ||
        model.providerLabel.toLowerCase().includes(searchLower)
    )
  }, [allModels, search])

  const groupedModels = useMemo(() => {
    const groups: { providerLabel: string; models: ModelItem[] }[] = []
    const providerMap = new Map<string, ModelItem[]>()

    filteredModels.forEach((model) => {
      if (!providerMap.has(model.providerId)) {
        providerMap.set(model.providerId, [])
      }
      providerMap.get(model.providerId)!.push(model)
    })

    providers.forEach((provider) => {
      const models = providerMap.get(provider.id)
      if (models && models.length > 0) {
        groups.push({
          providerLabel: getProviderLabel(provider),
          models
        })
      }
    })

    return groups
  }, [filteredModels, providers])

  const getDisplayValue = () => {
    if (!value) return placeholder
    const model = allModels.find((m) => m.value === value)
    return model ? `${model.providerLabel} / ${model.label}` : placeholder
  }

  useEffect(() => {
    setHighlightedIndex(0)
  }, [search])

  useEffect(() => {
    if (!open) {
      setSearch("")
      setHighlightedIndex(0)
    }
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredModels.length === 0) return

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < filteredModels.length - 1 ? prev + 1 : prev))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case "Enter":
        e.preventDefault()
        if (filteredModels[highlightedIndex]) {
          onValueChange(filteredModels[highlightedIndex].value)
          setOpen(false)
        }
        break
      case "Escape":
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  useEffect(() => {
    if (listRef.current && highlightedIndex >= 0) {
      const highlightedElement = listRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      ) as HTMLElement
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: "nearest" })
      }
    }
  }, [highlightedIndex])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="inline-flex justify-between"
          >
            {getDisplayValue()}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[--anchor-width] p-0">
        <div className="flex flex-col">
          <div className="p-2 border-b">
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div ref={listRef} className="p-1">
            {filteredModels.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No model found.</div>
            ) : (
              groupedModels.map((group, groupIndex) => (
                <div key={groupIndex}>
                  {groupIndex > 0 && <div className="h-px bg-border my-1" />}
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.providerLabel}
                  </div>
                  {group.models.map((model) => {
                    const globalIndex = filteredModels.findIndex((m) => m.value === model.value)
                    const isSelected = value === model.value
                    const isHighlighted = globalIndex === highlightedIndex

                    return (
                      <ModelSelectItem
                        key={model.value}
                        model={model}
                        globalIndex={globalIndex}
                        isSelected={isSelected}
                        isHighlighted={isHighlighted}
                        onSelect={(value) => {
                          onValueChange(value)
                          setOpen(false)
                        }}
                        onHighlight={setHighlightedIndex}
                      />
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

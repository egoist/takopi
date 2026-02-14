import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useConfigQuery, useUpdateConfigMutation } from "@/lib/queries"
import { parseFullModelId } from "@/lib/providers"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"

export function AgentSelect() {
  const [open, setOpen] = useState(false)
  const { data: config } = useConfigQuery()
  const updateConfigMutation = useUpdateConfigMutation()

  const handleChange = (newValue: string | null) => {
    if (newValue) {
      updateConfigMutation.mutate({
        defaultAgent: newValue
      })
      setOpen(false)
    }
  }

  const selectedAgent = config?.agents.find((agent) => agent.id === config?.defaultAgent)

  const getModelName = (fullModelId: string) => {
    const { providerId, modelId } = parseFullModelId(fullModelId)
    const provider = config?.providers.find((p) => p.id === providerId)
    const model = provider?.models.find((m) => m.id === modelId)
    return model?.name
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            {selectedAgent?.name || "No agent selected"}
            <ChevronDownIcon />
          </Button>
        }
      />
      <DropdownMenuContent>
        {config?.agents.map((agent) => (
          <DropdownMenuItem key={agent.id} onClick={() => handleChange(agent.id)}>
            <div className="flex flex-col">
              <span>{agent.name || "unknown"}</span>
              <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
                {getModelName(agent.model) || "model not found"}
              </span>
            </div>
            <CheckIcon
              className={`ml-auto ${
                agent.id === config?.defaultAgent ? "opacity-100" : "opacity-0"
              }`}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

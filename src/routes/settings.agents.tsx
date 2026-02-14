import { useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus } from "lucide-react"
import type { AgentConfig } from "@/types/config"
import { ModelSelect } from "@/components/model-select"
import { useConfigQuery, useUpdateConfigMutation } from "@/lib/queries"
import { useQueryClient } from "@tanstack/react-query"
import { rpc } from "@/lib/rpc-client"
import { TabbedSettings } from "@/components/tabbed-settings"

export default function AgentsSettings() {
  const { data: config } = useConfigQuery()
  const saveConfigMutation = useUpdateConfigMutation()
  const [searchParams, setSearchParams] = useSearchParams()

  const queryClient = useQueryClient()
  const agents: AgentConfig[] = config?.agents || []

  const saveConfig = (updatedAgents: AgentConfig[]) => {
    saveConfigMutation.mutate({
      agents: updatedAgents
    })
  }

  const handleAddAgent = () => {
    const newAgent: AgentConfig = {
      id: `agent-${Date.now()}`,
      name: "",
      model: ""
    }
    const updatedAgents = [...agents, newAgent]
    setSearchParams({ id: newAgent.id })
    saveConfig(updatedAgents)
  }

  const handleAgentChange = (agentIndex: number, field: keyof AgentConfig, value: string) => {
    const updatedAgents = agents.map((a, i) => (i === agentIndex ? { ...a, [field]: value } : a))

    saveConfig(updatedAgents)
  }

  const handleEditId = (agentIndex: number) => {
    const agent = agents[agentIndex]
    const newId = window.prompt("Enter new agent ID:", agent.id)

    if (newId && newId.trim() && newId !== agent.id) {
      // Update URL if this agent is active
      if (searchParams.get("id") === agent.id) {
        setSearchParams({ id: newId })
      }

      // Update the agent ID
      const updatedAgents = agents.map((a, i) => (i === agentIndex ? { ...a, id: newId } : a))
      saveConfig(updatedAgents)
    }
  }

  const getAgentLabel = (agent: AgentConfig) => {
    if (agent.name && agent.name.trim()) {
      return agent.name
    }
    return `Agent ${agents.indexOf(agent) + 1}`
  }

  const handleRemoveAgent = (agentId: string) => {
    const updatedAgents = agents.filter((a) => a.id !== agentId)

    // If the removed agent was active, switch to another tab
    if (searchParams.get("id") === agentId && updatedAgents.length > 0) {
      setSearchParams({ id: updatedAgents[0].id })
    }

    saveConfig(updatedAgents)
  }

  if (!config) {
    return null
  }

  const tabs = agents.map((agent) => ({
    id: agent.id,
    label: getAgentLabel(agent)
  }))

  return (
    <TabbedSettings
      tabs={tabs}
      addButton={
        <Button variant="outline" size="sm" onClick={handleAddAgent} className="w-full">
          <Plus className="h-4 w-4 mr-1" />
          Add Agent
        </Button>
      }
      onRemoveTab={handleRemoveAgent}
    >
      {(activeTab) =>
        agents.map(
          (agent, agentIndex) =>
            activeTab === agent.id && (
              <div key={agent.id}>
                <div className="mb-4">
                  <div className="flex gap-2 items-center">
                    <h2 className="text-lg font-semibold">{getAgentLabel(agent)}</h2>
                    <Button variant="outline" size="sm" onClick={() => handleEditId(agentIndex)}>
                      {agent.id}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor={`${agent.id}-name`}>Agent Name</Label>
                    <Input
                      id={`${agent.id}-name`}
                      type="text"
                      placeholder="e.g., Customer Support Agent"
                      value={agent.name || ""}
                      onChange={(e) => handleAgentChange(agentIndex, "name", e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Give this agent a descriptive name to easily identify it.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor={`${agent.id}-model`}>Model</Label>
                    <div>
                      <ModelSelect
                        id={`${agent.id}-model`}
                        value={agent.model}
                        onValueChange={(value) => handleAgentChange(agentIndex, "model", value)}
                        placeholder="Select a model"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The model this agent should use.
                    </p>
                  </div>
                </div>
              </div>
            )
        )
      }
    </TabbedSettings>
  )
}

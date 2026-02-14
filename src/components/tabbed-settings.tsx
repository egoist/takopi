import type { ReactNode } from "react"
import { useSearchParams } from "react-router"
import { useEffect } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"

interface Tab {
  id: string
  label: string
}

interface TabbedSettingsProps {
  tabs: Tab[]
  addButton?: ReactNode
  onRemoveTab?: (tabId: string) => void
  children: (activeTab: string) => ReactNode
}

export function TabbedSettings({ tabs, addButton, onRemoveTab, children }: TabbedSettingsProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTabFromUrl = searchParams.get("id")

  // Determine active tab: URL param > first tab
  const activeTab =
    activeTabFromUrl && tabs.some((t) => t.id === activeTabFromUrl)
      ? activeTabFromUrl
      : tabs[0]?.id || ""

  // Update URL when active tab changes
  useEffect(() => {
    if (activeTab && activeTab !== activeTabFromUrl) {
      setSearchParams({ id: activeTab }, { replace: true })
    }
  }, [activeTab, activeTabFromUrl, setSearchParams])

  const handleTabChange = (tabId: string) => {
    setSearchParams({ id: tabId })
  }

  return (
    <div className="flex h-full">
      {/* Sidebar with tabs */}
      <div className="w-52 border-r p-4">
        {addButton && <div className="mb-4">{addButton}</div>}
        <div className="space-y-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  handleTabChange(tab.id)
                }
              }}
              className={`group flex items-center justify-between gap-1 px-3 h-8 text-sm rounded-md transition-colors w-full text-left cursor-default ${
                activeTab === tab.id
                  ? "bg-secondary text-secondary-foreground"
                  : "hover:bg-secondary/50"
              }`}
            >
              <span className="flex-1 text-left truncate">{tab.label}</span>
              {onRemoveTab && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="p-1 hover:bg-background/50 rounded opacity-0 group-hover:opacity-100 data-popup-open:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent onClick={(e) => e.preventDefault()}>
                    <DropdownMenuItem
                      onClick={() => onRemoveTab(tab.id)}
                      className="text-destructive"
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-3xl">{children(activeTab)}</div>
      </div>
    </div>
  )
}

import { Link, Outlet, useLocation } from "react-router"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function SettingsLayout() {
  const location = useLocation()
  const isProvidersRoute = location.pathname === "/settings/providers"
  const isAgentsRoute = location.pathname === "/settings/agents"

  return (
    <div className="flex flex-col h-dvh">
      <header className="h-10 flex items-center text-sm gap-2 border-b app-drag-region px-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1  text-zinc-500 hover:bg-zinc-100 rounded-md px-1 h-6"
        >
          <span className="i-tabler-arrow-left"></span>
          <span className="text-sm font-medium">Back to app</span>
        </Link>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-48 border-r p-4 space-y-1">
          <Link to="/settings">
            <Button
              variant={!isProvidersRoute && !isAgentsRoute ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              General
            </Button>
          </Link>
          <Link to="/settings/providers">
            <Button
              variant={isProvidersRoute ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              Providers
            </Button>
          </Link>
          <Link to="/settings/agents">
            <Button
              variant={isAgentsRoute ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              Agents
            </Button>
          </Link>
        </nav>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

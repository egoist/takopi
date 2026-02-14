import { Button } from "@/components/ui/button"
import type { ToolConfirmation as ToolConfirmationType } from "@/lib/types"
import { Check, X, Shield } from "lucide-react"

interface ToolConfirmationProps {
  confirmation: ToolConfirmationType
  onConfirm: (toolCallId: string, approved: boolean) => void
}

function formatArgs(args: Record<string, unknown>): string {
  // For Bash, show just the command
  if (typeof args.command === "string") {
    return args.command
  }
  // For Write, show the file path
  if (typeof args.file_path === "string") {
    return args.file_path
  }
  return JSON.stringify(args, null, 2)
}

export function ToolConfirmation({ confirmation, onConfirm }: ToolConfirmationProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 my-2">
      <div className="flex items-start gap-2">
        <Shield className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-amber-800">
            {confirmation.toolName} wants to execute
          </div>
          <pre className="mt-1 text-xs text-amber-700 bg-amber-100 rounded p-2 overflow-auto whitespace-pre-wrap break-all">
            {formatArgs(confirmation.args)}
          </pre>
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => onConfirm(confirmation.toolCallId, true)}
            >
              <Check className="w-3.5 h-3.5" />
              Allow
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onConfirm(confirmation.toolCallId, false)}
            >
              <X className="w-3.5 h-3.5" />
              Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

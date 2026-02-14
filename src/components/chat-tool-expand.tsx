import { type ReactNode, useState } from "react"
import { cn } from "@/lib/utils"

export function ChatToolExpand({
  children,
  label,
  isLoading
}: {
  children?: ReactNode
  label: ReactNode
  isLoading?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          `inline-flex w-full items-center gap-1 text-sm group/btn transition-colors max-w-[30rem]`,
          isLoading ? "animate-pulse " : ""
        )}
      >
        <span className={cn("truncate", isLoading && "shine-text")}>{label}</span>
        <span
          className={cn(
            `shrink-0 transition inline-flex items-center justify-center`,
            isOpen ? "rotate-90 opacity-100" : ""
          )}
        >
          <span className="i-tabler-chevron-right"></span>
        </span>
      </button>

      {isOpen && children}
    </div>
  )
}

import { useEffect, useRef } from "react"
import { Popover } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"

interface SkillItem {
  name: string
  description: string
}

interface SlashCommandPopoverProps {
  open: boolean
  skills: SkillItem[]
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  highlightedIndex: number
  onHighlightChange: (index: number) => void
  onSelect: (skillName: string) => void
}

export function SlashCommandPopover({
  open,
  skills,
  textareaRef,
  highlightedIndex,
  onHighlightChange,
  onSelect,
}: SlashCommandPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current && highlightedIndex >= 0) {
      const el = listRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      ) as HTMLElement
      if (el) {
        el.scrollIntoView({ block: "nearest" })
      }
    }
  }, [highlightedIndex])

  return (
    <Popover.Root open={open}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={textareaRef}
          side="top"
          align="start"
          sideOffset={4}
          className="isolate z-50"
        >
          <Popover.Popup initialFocus={false} finalFocus={false} className="bg-popover text-popover-foreground ring-foreground/10 flex flex-col rounded-lg text-sm shadow-md ring-1 origin-(--transform-origin) outline-hidden w-72">
            <div ref={listRef} className="max-h-[200px] overflow-y-auto p-1">
              {skills.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No skills found
                </div>
              ) : (
                skills.map((skill, index) => (
                  <button
                    key={skill.name}
                    data-index={index}
                    tabIndex={-1}
                    className={cn(
                      "w-full flex flex-col items-start px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
                      index === highlightedIndex &&
                        "bg-accent text-accent-foreground",
                      index !== highlightedIndex && "hover:bg-accent/50"
                    )}
                    onMouseEnter={() => onHighlightChange(index)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelect(skill.name)
                    }}
                  >
                    <span className="font-medium truncate w-full text-left">
                      /{skill.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate w-full text-left">
                      {skill.description}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

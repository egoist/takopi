import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

interface InputProps extends React.ComponentProps<"input"> {
  isPassword?: boolean
}

function Input({
  className,
  type,
  isPassword,
  value: externalValue,
  onChange: externalOnChange,
  onCompositionStart: externalOnCompositionStart,
  onCompositionEnd: externalOnCompositionEnd,
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const composingRef = React.useRef(false)
  const isControlled = externalValue !== undefined
  const [internalValue, setInternalValue] = React.useState(externalValue ?? "")

  React.useEffect(() => {
    if (!composingRef.current && isControlled) {
      setInternalValue(externalValue)
    }
  }, [externalValue, isControlled])

  const inputType = isPassword ? (showPassword ? "text" : "password") : type

  return (
    <div className="relative flex">
      <input
        type={inputType}
        data-slot="input"
        className={cn(
          "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors file:h-6 file:text-sm file:font-medium focus-visible:ring-[3px] aria-invalid:ring-[3px] md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          isPassword && "pr-9",
          className
        )}
        {...(isControlled ? { value: internalValue } : {})}
        onChange={(e) => {
          if (isControlled) {
            setInternalValue(e.target.value)
          }
          if (!composingRef.current) {
            externalOnChange?.(e)
          }
        }}
        onCompositionStart={(e) => {
          composingRef.current = true
          externalOnCompositionStart?.(e)
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          externalOnCompositionEnd?.(e)
          externalOnChange?.({
            target: e.currentTarget,
            currentTarget: e.currentTarget,
          } as React.ChangeEvent<HTMLInputElement>)
        }}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
          tabIndex={-1}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
}

export { Input }

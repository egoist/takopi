import { getTheme } from "@/inline-script"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"

const ThemeAtom = atom(window.inlineScriptExports.INITIAL_THEME)

/** call this at the root component once to register theme change event */
export const useThemeRoot = () => {
  const setTheme = useSetAtom(ThemeAtom)

  useEffect(() => {
    const handler = () => {
      const theme = window.inlineScriptExports.getTheme()

      setTheme(theme)

      window.inlineScriptExports.updateThemeClass(theme)
    }
    window.inlineScriptExports.themeMql.addEventListener("change", handler)
    return () => {
      window.inlineScriptExports.themeMql.removeEventListener("change", handler)
    }
  }, [])
}

export const useTheme = () => useAtomValue(ThemeAtom)

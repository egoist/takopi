/** this script gets embedded into the initial html */

const themeMql = window.matchMedia("(prefers-color-scheme: dark)")

const getTheme = () => {
  const theme = localStorage.getItem("theme")

  if (!theme || theme === "system") {
    return themeMql.matches ? "dark" : "light"
  }

  return theme as "dark" | "light"
}

const INITIAL_THEME = getTheme()

const updateThemeClass = (theme = INITIAL_THEME) => {
  if (theme === "light") {
    document.documentElement.classList.remove("dark")
  } else if (theme === "dark") {
    document.documentElement.classList.add("dark")
  }
}

updateThemeClass()

export { updateThemeClass, themeMql, getTheme, INITIAL_THEME }

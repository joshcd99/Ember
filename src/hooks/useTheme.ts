import { useEffect, useState } from "react"

type Theme = "dark" | "light"

const STORAGE_KEY = "ember-theme"

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark") return stored
  return "dark"
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === "light") {
      root.setAttribute("data-theme", "light")
    } else {
      root.removeAttribute("data-theme")
    }
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggleTheme = () => setThemeState((prev) => (prev === "dark" ? "light" : "dark"))

  return { theme, setTheme, toggleTheme }
}

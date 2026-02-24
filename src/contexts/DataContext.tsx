import { createContext, useContext, type ReactNode } from "react"
import { useData, type AppData } from "@/hooks/useData"

const DataContext = createContext<AppData | undefined>(undefined)

export function DataProvider({ children }: { children: ReactNode }) {
  const data = useData()
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export function useAppData(): AppData {
  const context = useContext(DataContext)
  if (!context) throw new Error("useAppData must be used within DataProvider")
  return context
}

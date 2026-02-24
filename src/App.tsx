import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { DataProvider } from "@/contexts/DataContext"
import { AuthGuard } from "@/components/AuthGuard"
import { Layout } from "@/components/Layout"
import { Dashboard } from "@/pages/Dashboard"
import { Debts } from "@/pages/Debts"
import { Income } from "@/pages/Income"
import { Bills } from "@/pages/Bills"
import { Checkin } from "@/pages/Checkin"
import { Scenarios } from "@/pages/Scenarios"
import { Settings } from "@/pages/Settings"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGuard>
          <DataProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/debts" element={<Debts />} />
                <Route path="/income" element={<Income />} />
                <Route path="/bills" element={<Bills />} />
                <Route path="/checkin" element={<Checkin />} />
                <Route path="/scenarios" element={<Scenarios />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
          </DataProvider>
        </AuthGuard>
      </AuthProvider>
    </BrowserRouter>
  )
}

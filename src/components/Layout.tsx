import { NavLink, Outlet } from "react-router-dom"
import {
  LayoutDashboard,
  CreditCard,
  Wallet,
  Receipt,
  CheckCircle2,
  SlidersHorizontal,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/debts", icon: CreditCard, label: "Debts" },
  { to: "/income", icon: Wallet, label: "Income" },
  { to: "/bills", icon: Receipt, label: "Bills" },
  { to: "/checkin", icon: CheckCircle2, label: "Check-in" },
  { to: "/scenarios", icon: SlidersHorizontal, label: "Scenarios" },
  { to: "/settings", icon: Settings, label: "Settings" },
]

export function Layout() {
  const { signOut, user, useMockMode } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-[220px] lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-card">
        <div className="flex flex-col flex-1 p-5">
          <h1 className="font-display text-2xl text-primary mb-8 tracking-tight">Ember</h1>
          <nav className="flex flex-col gap-1 flex-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-border pt-4 mt-4 space-y-3">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <p className="text-xs text-muted-foreground truncate">
              {useMockMode ? "Demo Mode" : user?.email}
            </p>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="font-display text-xl text-primary">Ember</h1>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="cursor-pointer p-1.5 text-muted-foreground hover:text-foreground">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="cursor-pointer">
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="px-4 pb-4 bg-card border-b border-border">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-[220px]">
        <div className="p-6 pt-20 lg:pt-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/EmptyState"
import { BillModal } from "@/components/modals/BillModal"
import { Receipt, Plus, Pencil } from "lucide-react"
import { useAppData } from "@/contexts/DataContext"
import { getMonthlyBills } from "@/lib/mock-data"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Bill } from "@/types/database"

export function Bills() {
  const { bills, loading } = useAppData()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  const monthlyBillsTotal = getMonthlyBills(bills)

  const frequencyLabel = (f: string) => {
    switch (f) {
      case "weekly": return "Weekly"
      case "biweekly": return "Every 2 weeks"
      case "monthly": return "Monthly"
      default: return f
    }
  }

  const openAdd = () => { setEditingBill(null); setModalOpen(true) }
  const openEdit = (b: Bill) => { setEditingBill(b); setModalOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Bills</h1>
          <p className="text-muted-foreground mt-1">Track what goes out.</p>
        </div>
        {bills.length > 0 && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Bill
          </Button>
        )}
      </div>

      {bills.length > 0 && (
        <Card>
          <CardHeader>
            <CardDescription>Monthly Bills</CardDescription>
            <CardTitle className="text-2xl text-destructive">{formatCurrency(monthlyBillsTotal)}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {bills.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8 text-muted-foreground" />}
          title="No bills yet"
          description="Add rent, utilities, subscriptions — anything you pay regularly. This helps us figure out what's left for debt payoff."
          actionLabel="Add Bill"
          onAction={openAdd}
        />
      ) : (
        <div className="space-y-3">
          {bills.map(bill => (
            <Card
              key={bill.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openEdit(bill)}
            >
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{bill.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {frequencyLabel(bill.frequency)} &middot; Due {formatDate(bill.next_due_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(bill.amount)}</p>
                    <Badge variant="secondary">{bill.category}</Badge>
                  </div>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BillModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        bill={editingBill}
      />
    </div>
  )
}

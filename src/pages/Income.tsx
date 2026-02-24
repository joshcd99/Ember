import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/EmptyState"
import { IncomeSourceModal } from "@/components/modals/IncomeSourceModal"
import { Plus, DollarSign, Pencil } from "lucide-react"
import { useAppData } from "@/contexts/DataContext"
import { getMonthlyIncome } from "@/lib/mock-data"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { IncomeSource } from "@/types/database"

export function Income() {
  const { incomeSources, loading } = useAppData()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null)

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  const monthlyIncome = getMonthlyIncome(incomeSources)

  const frequencyLabel = (f: string) => {
    switch (f) {
      case "weekly": return "Weekly"
      case "biweekly": return "Every 2 weeks"
      case "monthly": return "Monthly"
      default: return f
    }
  }

  const openAdd = () => { setEditingSource(null); setModalOpen(true) }
  const openEdit = (s: IncomeSource) => { setEditingSource(s); setModalOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Income</h1>
          <p className="text-muted-foreground mt-1">Track your fuel.</p>
        </div>
        {incomeSources.length > 0 && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Source
          </Button>
        )}
      </div>

      {incomeSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardDescription>Monthly Income</CardDescription>
            <CardTitle className="text-2xl text-success">{formatCurrency(monthlyIncome)}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {incomeSources.length === 0 ? (
        <EmptyState
          icon={<DollarSign className="h-8 w-8 text-success" />}
          title="No income sources yet"
          description="Add your paychecks, freelance gigs, or any recurring income. This is what feeds the fire."
          actionLabel="Add Income Source"
          onAction={openAdd}
        />
      ) : (
        <div className="space-y-3">
          {incomeSources.map(source => (
            <Card
              key={source.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openEdit(source)}
            >
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="font-medium">{source.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {frequencyLabel(source.frequency)} &middot; Next: {formatDate(source.next_expected_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(source.amount)}</p>
                    {source.is_variable && <Badge variant="warning">Variable</Badge>}
                  </div>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <IncomeSourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        source={editingSource}
      />
    </div>
  )
}

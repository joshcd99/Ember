export const CATEGORY_COLORS = [
  "#C2785C", // terracotta
  "#C49A3C", // amber
  "#CD6B6B", // coral
  "#D4926B", // peach
  "#7DA47D", // sage
  "#5C9E9E", // teal
  "#6B8599", // slate
  "#5B79A8", // cobalt
  "#8B7EB8", // lavender
  "#C46B8A", // rose
  "#5CB8A5", // mint
  "#B8993E", // gold
  "#8C8578", // warm gray
  "#B5A68C", // sand
  "#5C5C5C", // charcoal
  "#6366A8", // indigo
] as const

export const DEFAULT_BILL_CATEGORIES: { name: string; color: string }[] = [
  { name: "Housing", color: "#5B79A8" },
  { name: "Utilities", color: "#C49A3C" },
  { name: "Insurance", color: "#6B8599" },
  { name: "Subscriptions", color: "#8B7EB8" },
  { name: "Food", color: "#7DA47D" },
  { name: "Transport", color: "#5C9E9E" },
  { name: "Health", color: "#CD6B6B" },
  { name: "Personal", color: "#C46B8A" },
  { name: "Debt", color: "#C2785C" },
  { name: "Other", color: "#8C8578" },
]

function escapeCSV(value: string | number): string {
  const str = String(value)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [
    headers.map(escapeCSV).join(","),
    ...rows.map(row => row.map(escapeCSV).join(",")),
  ]
  const csv = lines.join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

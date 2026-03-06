import confetti from "canvas-confetti"

export function celebrateDebtPayoff() {
  const colors = ["#5F9EA0", "#6AAF7D", "#D4A844", "#e8845a"]

  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors,
  })

  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 100,
      origin: { y: 0.5, x: 0.6 },
      colors,
    })
  }, 300)
}

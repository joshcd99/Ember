import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"
import { forwardRef, type ComponentPropsWithoutRef } from "react"

const Progress = forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-3 w-full overflow-hidden rounded-full bg-muted", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
      style={{ width: `${value || 0}%` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = "Progress"

export { Progress }

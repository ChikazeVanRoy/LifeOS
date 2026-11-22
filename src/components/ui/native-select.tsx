import * as React from "react"
import { cn } from "@/lib/utils"

/** The browser's own picker, so phones show their wheel, with one size and look everywhere. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 rounded-xl border border-input bg-card px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }

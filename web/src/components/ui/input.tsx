import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[7px] border border-border/56 bg-background/68 px-3 py-1 text-base shadow-[inset_0_1px_3px_hsl(var(--shadow-warm)/0.04)] transition-[border-color,box-shadow,background] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-[hsl(var(--teal)/0.52)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[hsl(var(--teal)/0.11)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] text-[13px] font-semibold transition-[background,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[hsl(var(--teal)/0.14)] disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[hsl(var(--primary)/0.78)] bg-[linear-gradient(180deg,hsl(14_38%_59%),hsl(var(--primary)))] text-primary-foreground shadow-[0_7px_16px_-13px_hsl(var(--primary)/0.76),inset_0_1px_0_hsl(0_0%_100%/0.16)] hover:border-[hsl(13_35%_46%/0.9)] hover:bg-[linear-gradient(180deg,hsl(14_36%_55%),hsl(13_35%_46%))]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-border/60 bg-background/72 text-foreground/82 shadow-none hover:border-[hsl(var(--teal)/0.3)] hover:bg-[hsl(var(--teal-soft)/0.46)] hover:text-foreground",
        secondary:
          "border border-border/58 bg-card/64 text-foreground/82 shadow-none hover:border-[hsl(var(--teal)/0.3)] hover:bg-[hsl(var(--teal-soft)/0.46)] hover:text-foreground",
        ghost: "text-foreground/72 hover:bg-foreground/[0.04] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        status:
          "border border-[hsl(var(--teal)/0.23)] bg-[hsl(var(--teal-soft)/0.72)] text-[hsl(var(--teal))] shadow-none disabled:opacity-100",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

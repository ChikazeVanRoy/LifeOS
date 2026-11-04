"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

export const Toaster = ({ theme, ...props }: ToasterProps) => (
  <Sonner
    theme={theme}
    position="bottom-center"
    offset={24}
    mobileOffset={{ bottom: 92 }}
    toastOptions={{
      // Long enough to reach Undo.
      duration: 6000,
      style: {
        borderRadius: 16,
        background: "var(--popover)",
        color: "var(--popover-foreground)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-float)",
        fontFamily: "var(--font-sans)",
      },
    }}
    {...props}
  />
)

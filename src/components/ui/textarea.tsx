import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-base backdrop-blur-sm transition-all duration-200 outline-none placeholder:text-muted-foreground/60 hover:border-white/[0.12] focus:border-blue-400/40 focus:bg-white/[0.05] focus:ring-3 focus:ring-blue-400/10 focus:shadow-[0_0_20px_rgba(59,130,246,0.06)] disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-400/40 aria-invalid:ring-3 aria-invalid:ring-red-400/10 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

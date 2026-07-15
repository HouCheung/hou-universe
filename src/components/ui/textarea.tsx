import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-slate-300/40 bg-white/60 px-3 py-2 text-base text-slate-700/80 backdrop-blur-sm transition-all duration-200 outline-none placeholder:text-slate-400/50 hover:border-slate-400/50 focus:border-blue-400/40 focus:bg-white/80 focus:ring-3 focus:ring-blue-400/10 focus:shadow-[0_0_20px_rgba(59,130,246,0.06)] disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-400/40 aria-invalid:ring-3 aria-invalid:ring-red-400/10 md:text-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/60 dark:placeholder:text-white/25 dark:hover:border-white/[0.12] dark:focus:bg-white/[0.05]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

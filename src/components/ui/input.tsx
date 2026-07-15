import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-slate-300/40 bg-white/60 px-3 py-1.5 text-base text-slate-700/80 backdrop-blur-sm transition-all duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400/50 hover:border-slate-400/50 focus:border-blue-400/40 focus:bg-white/80 focus:ring-3 focus:ring-blue-400/10 focus:shadow-[0_0_20px_rgba(59,130,246,0.06)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-400/40 aria-invalid:ring-3 aria-invalid:ring-red-400/10 md:text-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/60 dark:placeholder:text-white/25 dark:hover:border-white/[0.12] dark:focus:bg-white/[0.05]",
        className
      )}
      {...props}
    />
  )
}

export { Input }

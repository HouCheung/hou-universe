import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[9px] text-sm font-medium whitespace-nowrap transition-all duration-300 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          // ── 高级感主按钮：低饱和深靛蓝纵向微渐变 + 立体光影系统 ──
          // 白天模式：深蓝纯色背景 + 纯白文字 + 浅色边框
          // 星夜模式：渐变深蓝 + 立体光影（完全不变）
          "relative border border-brand/20 dark:border-white/[0.08] " +
          "bg-brand dark:bg-gradient-to-b dark:from-brand dark:to-brand-deep " +
          "text-slate-900 dark:text-white font-medium tracking-[0.01em] " +
          // 白天：浅投影；星夜：立体阴影系统
          "shadow-[0_1px_4px_rgba(0,0,0,0.08)] " +
          "dark:shadow-[0_2px_8px_rgba(var(--brand-deep-rgb),0.2),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.18),inset_1px_0_0_rgba(255,255,255,0.06)] " +
          // ::before — 顶部玻璃高光覆盖层（星夜模式专用）
          "before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none before:transition-opacity before:duration-300 " +
          "before:bg-gradient-to-b before:from-transparent before:to-transparent " +
          "dark:before:from-white/[0.06] dark:before:to-transparent " +
          // ::after — 悬浮星芒闪效（径向光晕，快速淡入淡出）
          "after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none " +
          "after:bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] " +
          "after:opacity-0 after:transition-opacity after:duration-200 " +
          // ── Hover 悬浮态：白天背景加深 / 星夜上浮2px + 外发光 ──
          "hover:bg-brand-deep dark:hover:bg-transparent dark:hover:from-brand-light dark:hover:to-brand " +
          "hover:-translate-y-0.5 " +
          "hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] " +
          "dark:hover:shadow-[0_4px_20px_rgba(var(--brand-rgb),0.22),0_0_40px_rgba(var(--brand-rgb),0.06),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.12),inset_1px_0_0_rgba(255,255,255,0.1)] " +
          "dark:hover:before:from-white/[0.1] " +
          "hover:after:opacity-100 " +
          // ── Active 点击态：下压1px + 光影回收 ──
          "active:translate-y-px " +
          "active:shadow-[0_0px_2px_rgba(0,0,0,0.06)] " +
          "dark:active:shadow-[0_1px_3px_rgba(var(--brand-deep-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)] " +
          "dark:active:before:from-white/[0.03] active:after:opacity-0",
        outline:
          // ── 高级感次按钮 ──
          // 白天模式：透明背景 + 深灰细边框 + 深灰文字 + 悬浮浅灰填充
          // 星夜模式：通透玻璃底 + 渐变半透明蓝边框（完全不变）
          "relative border border-slate-300/40 dark:border-white/[0.06] " +
          "bg-transparent dark:bg-[rgba(var(--brand-rgb),0.06)] dark:backdrop-blur-sm " +
          "text-slate-800 dark:text-slate-300 font-normal tracking-[0.01em] " +
          // 微弱顶部内高光（星夜模式专用）
          "shadow-none dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] " +
          // ::before — 内发光层（默认隐藏）
          "before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none before:transition-opacity before:duration-300 " +
          "before:bg-[radial-gradient(ellipse_at_center,rgba(var(--brand-rgb),0.08)_0%,transparent_70%)] " +
          "before:opacity-0 " +
          // ── Hover 悬浮态：白天填充浅灰背景 / 星夜底色加深 + 边框提亮 ──
          "hover:bg-slate-100/60 dark:hover:bg-[rgba(var(--brand-rgb),0.12)] " +
          "hover:border-slate-400/50 dark:hover:border-white/[0.12] " +
          "hover:text-slate-800 dark:hover:text-foreground hover:-translate-y-px " +
          "hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] " +
          "dark:hover:shadow-[inset_0_0_20px_rgba(var(--brand-rgb),0.06),inset_0_1px_0_rgba(255,255,255,0.06),0_4px_16px_rgba(var(--brand-rgb),0.06)] " +
          "hover:before:opacity-100 " +
          // ── Active 点击态 ──
          "active:translate-y-px " +
          "active:shadow-none dark:active:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] " +
          "active:before:opacity-0 " +
          // Expanded 态
          "aria-expanded:bg-slate-100/60 dark:aria-expanded:bg-[rgba(var(--brand-rgb),0.12)] aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-slate-800 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:text-slate-300 dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-[9px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-[9px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xl: "h-11 gap-2 px-7 text-base sm:h-12 sm:px-9",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-[9px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-[9px]",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

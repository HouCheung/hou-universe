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
          // 底色：上浅下深 (#1e40af → #1e3a8a)，饱和度低沉稳不跳
          "relative border border-white/[0.08] " +
          "bg-gradient-to-b from-[#1e40af] to-[#1e3a8a] " +
          "text-white font-medium tracking-[0.01em] " +
          // 立体阴影：外投影 + 顶部内高光 + 底部内阴影 + 左侧1px竖高光条
          "shadow-[0_2px_8px_rgba(30,58,138,0.2),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.18),inset_1px_0_0_rgba(255,255,255,0.06)] " +
          // ::before — 顶部玻璃高光覆盖层
          "before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/[0.06] before:to-transparent before:pointer-events-none before:transition-opacity before:duration-300 " +
          // ::after — 悬浮星芒闪效（径向光晕，快速淡入淡出）
          "after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none " +
          "after:bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] " +
          "after:opacity-0 after:transition-opacity after:duration-200 " +
          // ── Hover 悬浮态：上浮2px + 外发光 + 内高光提亮 + 星芒闪效 ──
          "hover:from-[#2563eb] hover:to-[#1e40af] hover:-translate-y-0.5 " +
          "hover:shadow-[0_4px_20px_rgba(30,64,175,0.22),0_0_40px_rgba(30,64,175,0.06),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.12),inset_1px_0_0_rgba(255,255,255,0.1)] " +
          "hover:before:from-white/[0.1] " +
          "hover:after:opacity-100 " +
          // ── Active 点击态：下压1px + 光影回收 ──
          "active:translate-y-px active:shadow-[0_1px_3px_rgba(30,58,138,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] " +
          "active:before:from-white/[0.03] active:after:opacity-0",
        outline:
          // ── 高级感次按钮：通透玻璃底 + 渐变半透明蓝边框 ──
          "relative border border-white/[0.06] " +
          "bg-[rgba(30,64,175,0.06)] backdrop-blur-sm " +
          "text-slate-300 font-normal tracking-[0.01em] " +
          // 微弱顶部内高光
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] " +
          // ::before — 内发光层（默认隐藏）
          "before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none before:transition-opacity before:duration-300 " +
          "before:bg-[radial-gradient(ellipse_at_center,rgba(30,64,175,0.08)_0%,transparent_70%)] " +
          "before:opacity-0 " +
          // ── Hover 悬浮态：底色加深 + 边框提亮 + 内发光 + 微上浮 ──
          "hover:bg-[rgba(30,64,175,0.12)] hover:border-white/[0.12] " +
          "hover:text-foreground hover:-translate-y-px " +
          "hover:shadow-[inset_0_0_20px_rgba(30,64,175,0.06),inset_0_1px_0_rgba(255,255,255,0.06),0_4px_16px_rgba(30,64,175,0.06)] " +
          "hover:before:opacity-100 " +
          // ── Active 点击态 ──
          "active:translate-y-px active:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] " +
          "active:before:opacity-0 " +
          // Expanded 态
          "aria-expanded:bg-[rgba(30,64,175,0.12)] aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
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

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于" },
  { href: "/projects", label: "项目" },
  { href: "/notes", label: "笔记" },
  { href: "/tools", label: "工具箱" },
  { href: "/guestbook", label: "留言墙" },
  { href: "/contact", label: "联系" },
];

export function NavBar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-500",
        scrolled
          ? "border-b border-white/[0.06] bg-[rgba(10,10,15,0.7)] backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.03)]"
          : "border-transparent bg-transparent"
      )}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="relative z-10 text-lg font-bold tracking-tight text-foreground transition-colors duration-300 hover:text-slate-300 sm:text-xl"
        >
          HOU Universe
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-0.5 text-sm md:flex">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "group relative inline-flex px-3 py-2 transition-colors duration-300",
                    isActive
                      ? "text-foreground font-medium"
                      : "text-slate-400 hover:text-foreground/90"
                  )}
                  {...(isActive ? { "aria-current": "page" as const } : {})}
                >
                  {label}
                  {/* Animated underline */}
                  <span
                    className={cn(
                      "absolute bottom-0 left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#1e40af]/60 to-[#1e3a8a]/60 transition-all duration-300 ease-out",
                      isActive ? "w-3/4" : "w-0 group-hover:w-3/4"
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="relative z-10 md:hidden"
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </nav>

      {/* Mobile menu */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 md:hidden",
          mobileOpen ? "max-h-96" : "max-h-0"
        )}
      >
        <div className="border-t border-white/[0.06] bg-[rgba(10,10,15,0.85)] backdrop-blur-xl">
          <ul className="flex flex-col gap-0.5 px-4 py-3">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive =
                href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "block rounded-md px-3 py-2.5 text-sm transition-colors duration-200",
                      isActive
                        ? "bg-white/[0.06] text-foreground font-medium"
                        : "text-slate-400 hover:text-foreground hover:bg-white/[0.04]"
                    )}
                    {...(isActive ? { "aria-current": "page" as const } : {})}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </header>
  );
}

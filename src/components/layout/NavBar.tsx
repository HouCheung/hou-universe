"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { SoundToggle } from "@/components/shared/SoundToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

const NAV_KEYS = [
  { href: "/", key: "nav.home" },
  { href: "/about", key: "nav.about" },
  { href: "/projects", key: "nav.projects" },
  { href: "/notes", key: "nav.notes" },
  { href: "/tools", key: "nav.tools" },
  { href: "/links", key: "nav.links" },
  { href: "/guestbook", key: "nav.guestbook" },
  { href: "/contact", key: "nav.contact" },
];

export function NavBar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const closeDrawer = useCallback(() => setMobileOpen(false), []);

  return (
    <header
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-500",
        scrolled
          ? "border-b border-slate-200/40 bg-white/65 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-white/[0.06] dark:bg-[rgba(10,10,15,0.65)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.03)]"
          : "border-transparent bg-transparent"
      )}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="relative z-10 text-lg font-bold tracking-tight text-foreground transition-colors duration-300 hover:text-brand dark:hover:text-slate-300 sm:text-xl"
        >
          HOU Universe
        </Link>

        {/* Desktop links + language switcher */}
        <div className="hidden items-center gap-0.5 text-sm md:flex">
          <ul className="flex items-center gap-0.5">
            {NAV_KEYS.map(({ href, key }) => {
              const isActive =
                href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(href);
              const label = t(key, { defaultValue: href });
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "group relative inline-flex px-3 py-2 transition-colors duration-300",
                      isActive
                        ? "text-foreground font-medium"
                        : "text-slate-600 hover:text-foreground dark:text-slate-400 dark:hover:text-foreground/90"
                    )}
                    {...(isActive ? { "aria-current": "page" as const } : {})}
                  >
                    {label}
                    {/* Animated underline */}
                    <span
                      className={cn(
                        "absolute bottom-0 left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand/60 to-brand-deep/60 transition-all duration-300 ease-out",
                        isActive ? "w-3/4" : "w-0 group-hover:w-3/4"
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="ml-2 flex items-center gap-1">
            <ThemeToggle />
            <LanguageSwitcher />
            <SoundToggle />
          </div>
        </div>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="relative z-50 md:hidden"
          aria-label={mobileOpen ? t("nav.menuClose") : t("nav.menuOpen")}
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </nav>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
              onClick={closeDrawer}
              aria-hidden="true"
            />

            {/* Drawer panel — slides from right */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 right-0 z-[70] w-72 max-w-[85vw] md:hidden"
            >
              <div className="flex h-full flex-col border-l border-slate-200/40 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-[#0a0a0f]">
                {/* Drawer header */}
                <div className="flex items-center justify-between border-b border-slate-200/40 px-5 py-4 dark:border-white/[0.06]">
                  <span className="text-sm font-semibold text-foreground">
                    {t("nav.drawerTitle")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t("nav.menuClose")}
                    onClick={closeDrawer}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Drawer nav links */}
                <ul className="flex flex-col gap-1 px-3 py-4">
                  {NAV_KEYS.map(({ href, key }, i) => {
                    const isActive =
                      href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(href);
                    const label = t(key, { defaultValue: href });
                    return (
                      <motion.li
                        key={href}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.3 }}
                      >
                        <Link
                          href={href}
                          onClick={closeDrawer}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-all duration-200",
                            isActive
                              ? "bg-brand/15 text-foreground font-medium border border-brand/20"
                              : "text-slate-600 hover:text-foreground hover:bg-slate-100/50 dark:text-slate-400 dark:hover:text-foreground dark:hover:bg-white/[0.04]"
                          )}
                          {...(isActive
                            ? { "aria-current": "page" as const }
                            : {})}
                        >
                          {/* Decorative dot */}
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              isActive
                                ? "bg-brand shadow-[0_0_6px_rgba(var(--brand-rgb),0.5)]"
                                : "bg-slate-500 dark:bg-slate-600"
                            )}
                          />
                          {label}
                        </Link>
                      </motion.li>
                    );
                  })}
                </ul>

                {/* Drawer footer brand + language switcher */}
                <div className="mt-auto border-t border-slate-200/40 px-5 py-4 dark:border-white/[0.04]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-600">
                      HOU Universe &copy; {new Date().getFullYear()}
                    </p>
                    <div className="flex items-center gap-1">
                      <ThemeToggle />
                      <LanguageSwitcher />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

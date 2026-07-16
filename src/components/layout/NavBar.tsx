"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
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
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Portal target — mount synchronously before paint so createPortal
  // has a real DOM node before any mobileOpen=true render. This prevents
  // first-frame flicker where the drawer content renders before the portal
  // container is attached.
  useLayoutEffect(() => {
    setPortalMounted(true);
  }, []);

  // ── Scroll-lock refs ──
  const scrollPosRef = useRef(0);
  const wasLockedRef = useRef(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // ── Lock page scroll when mobile drawer opens (<768px only).
  // Uses overflow:hidden + touch-action:none (NOT position:fixed)
  // to avoid layout shifts and reflows that cause flickering.
  // Unlock is deferred to transitionend so the exit animation finishes
  // before the viewport is released.
  useEffect(() => {
    if (!mobileOpen) return;
    // Only apply on mobile viewport (<768px)
    if (window.innerWidth >= 768) return;

    wasLockedRef.current = true;
    scrollPosRef.current = window.scrollY;

    // Disable CSS smooth-scroll so that the final window.scrollTo() is
    // an instant jump, never an animated transition that looks like a
    // "rollback". Restored in restoreScroll().
    document.documentElement.style.scrollBehavior = "auto";

    // Lock viewport without changing layout (no position:fixed)
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.style.touchAction = "none";
  }, [mobileOpen]);

  // ── Restore scroll position atomically — all style removal +
  // scrollTo in the same synchronous block, zero frames in between.
  const restoreScroll = useCallback(() => {
    if (!wasLockedRef.current) return;
    wasLockedRef.current = false;

    const savedY = scrollPosRef.current;

    // Strip every lock style synchronously (single reflow)
    document.documentElement.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
    document.documentElement.style.scrollBehavior = "";
    document.body.style.overflow = "";
    document.body.style.overscrollBehavior = "";
    document.body.style.touchAction = "";

    // Force the browser to recompute layout before scrollTo —
    // guarantees the document has a valid scrollHeight to target.
    void document.body.offsetHeight;

    // Instant jump (scroll-behavior was set to "auto" on lock)
    window.scrollTo(0, Math.max(0, savedY));
  }, []);

  // ── Safeguard: if the component unmounts while the drawer is still
  // open (e.g. route change), restore scroll so the next page isn't
  // stuck with scroll locked.
  useEffect(() => {
    return () => {
      if (wasLockedRef.current) restoreScroll();
    };
  }, [restoreScroll]);

  // ── Close drawer → CSS transition slides panel out.
  // scroll restoration is deferred to transitionend so that:
  //   1. The slide-out animation runs to completion (scroll stays locked)
  //   2. All DOM style cleanup + scrollTo happens in ONE synchronous block
  //      after the transition, eliminating multi-frame jank.
  const closeDrawer = useCallback(() => setMobileOpen(false), []);

  // ── Fires when the drawer panel's CSS transform transition completes.
  // Only acts on the "close" direction (mobileOpen === false).
  const handleDrawerTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      // We only care about the transform property completing
      if (e.propertyName !== "transform") return;
      // Only restore scroll when the drawer just finished closing
      if (!mobileOpen) {
        restoreScroll();
      }
    },
    [mobileOpen, restoreScroll]
  );

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          Header — desktop & mobile chrome, stacking context isolated
          ═══════════════════════════════════════════════════════════ */}
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

          {/* Mobile hamburger — stays inside header nav for flex layout.
              When drawer is open this button sits behind the portaled
              backdrop (body-level z-99999 vs header-level z-50); users
              close via backdrop tap or the X button inside the drawer. */}
          <Button
            variant="ghost"
            size="icon"
            className="relative md:hidden"
            aria-label={mobileOpen ? t("nav.menuClose") : t("nav.menuOpen")}
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </nav>
      </header>

      {/* ═══════════════════════════════════════════════════════════
          Mobile drawer + backdrop — PORTALED to document.body.
          This escapes the header's z-50 stacking context so the drawer
          truly renders above ALL page content (Canvas, particles,
          modals, EntranceSequence at z-[10000], etc.).

          Both elements permanently mounted in DOM (zero conditional
          rendering).  Closed = translateX(100%) off-screen.
          ═══════════════════════════════════════════════════════════ */}
      {portalMounted &&
        createPortal(
          <>
            {/* Backdrop — solid black + blur, opacity:1, zero fade.
                Visibility binary toggle: instant-on, delayed-off
                (stays visible while drawer slides out 300ms). */}
            <div
              className="md:hidden"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                backgroundColor: "#000000",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                opacity: 1,
                visibility: mobileOpen ? "visible" : "hidden",
                transition: mobileOpen ? "none" : "visibility 0s 300ms",
                pointerEvents: mobileOpen ? "auto" : "none",
              }}
              onClick={closeDrawer}
              aria-hidden={!mobileOpen}
            />

            {/* Drawer panel — solid opaque bg, pure transform,
                will-change for GPU compositing, zero opacity animation. */}
            <div
              ref={drawerRef}
              className="md:hidden"
              style={{
                position: "fixed",
                top: 0,
                bottom: 0,
                right: 0,
                zIndex: 100000,
                width: "min(288px, 85vw)",
                maxWidth: "85vw",
                transform: mobileOpen ? "translateX(0)" : "translateX(100%)",
                transition: "transform 300ms ease-out",
                willChange: "transform",
                pointerEvents: mobileOpen ? "auto" : "none",
              }}
              onTransitionEnd={handleDrawerTransitionEnd}
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

                {/* Drawer nav links — pure transform stagger, ZERO opacity.
                    opacity permanently 1 — no fade-in, no translucent frames. */}
                <ul className="flex flex-col gap-1 px-3 py-4">
                  {NAV_KEYS.map(({ href, key }, i) => {
                    const isActive =
                      href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(href);
                    const label = t(key, { defaultValue: href });
                    return (
                      <li
                        key={href}
                        style={{
                          transform: mobileOpen
                            ? "translateX(0)"
                            : "translateX(16px)",
                          transition: mobileOpen
                            ? `transform 0.25s ease ${i * 0.04}s`
                            : "none",
                        }}
                      >
                        <Link
                          href={href}
                          onClick={closeDrawer}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-all duration-200",
                            isActive
                              ? "text-foreground font-medium border border-brand/20 bg-brand/15"
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
                      </li>
                    );
                  })}
                </ul>

                {/* Drawer footer brand + controls */}
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
            </div>
          </>,
          document.body
        )}
    </>
  );
}

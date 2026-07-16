"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";

/* ═══════════════════════════════════════════════════════════
   Section label mapping — route → i18n key for label
   ═══════════════════════════════════════════════════════════ */

const ROUTE_LABEL_KEYS: Record<string, string> = {
  "/": "nav.home",
  "/projects": "nav.projects",
  "/about": "nav.about",
  "/notes": "nav.notes",
  "/tools": "nav.tools",
  "/guestbook": "nav.guestbook",
  "/contact": "nav.contact",
};

function getLabelKeyFromPathname(pathname: string): string {
  if (pathname === "/") return ROUTE_LABEL_KEYS["/"];
  for (const [route, key] of Object.entries(ROUTE_LABEL_KEYS)) {
    if (route !== "/" && pathname.startsWith(route)) {
      return key;
    }
  }
  return "";
}

/* ═══════════════════════════════════════════════════════════
   ScrollProgress — right-side 1px scroll progress indicator + section name
   ═══════════════════════════════════════════════════════════ */

export function ScrollProgress() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { scrollYProgress } = useScroll();
  const [progress, setProgress] = useState(0);
  const [sectionName, setSectionName] = useState("");

  /* ── Track scroll progress ── */
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    setProgress(latest);
  });

  /* ── Derive section name from route + scroll position ── */
  useEffect(() => {
    // On home page, detect section by viewport scroll
    if (pathname === "/") {
      const onScroll = () => {
        const scrollY = window.scrollY;
        const vh = window.innerHeight;
        if (vh <= 0) return;
        if (scrollY < vh * 0.6) {
          setSectionName(t("nav.home"));
        } else if (scrollY < vh * 2.8) {
          setSectionName(t("nav.projects"));
        } else {
          setSectionName(t("nav.about"));
        }
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    // Other pages — use pathname
    const labelKey = getLabelKeyFromPathname(pathname);
    setSectionName(labelKey ? t(labelKey) : "");
  }, [pathname, t]);

  /* ── Smooth progress percentage ── */
  const progressPercent = useMemo(() => Math.round(progress * 100), [progress]);

  return (
    <aside
      aria-hidden="true"
      className="fixed right-0 top-0 z-[45] hidden h-full w-[18px] md:block"
    >
      {/* Clickable full-height track */}
      <div className="relative mx-auto h-full w-px">
        {/* Background track — 1px subtle line */}
        <div className="absolute inset-0 bg-white/[0.04]" />

        {/* Progress fill — 1px, theme-aware gradient */}
        <motion.div
          className="scroll-progress-fill absolute left-0 top-0 w-px origin-top"
          style={{ scaleY: progress, originY: 0 }}
        />
      </div>

      {/* Section label — vertical text beside the track */}
      {sectionName && (
        <div className="absolute left-0 top-[35%] -translate-x-full pr-2.5">
          <span className="scroll-progress-label block text-[10px] font-medium tracking-[0.15em] text-slate-500/50">
            {sectionName}
          </span>
        </div>
      )}

      {/* Progress percentage at bottom */}
      <div className="absolute bottom-6 left-0 w-full text-center">
        <span className="block text-[9px] font-mono tabular-nums text-slate-500/30">
          {progressPercent}
        </span>
      </div>
    </aside>
  );
}

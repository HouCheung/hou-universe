"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Mail } from "lucide-react";
import { StarField } from "@/components/shared/StarField";
import { LinkCard } from "@/components/links/LinkCard";
import { getLinksByCategory } from "@/data/links";
import { Button } from "@/components/ui/button";

const CATEGORY_KEYS: Record<string, string> = {
  friend: "links.friendLinks",
  tool: "links.toolNav",
};

export function LinksPageContent() {
  const { t } = useTranslation();
  const [showTip, setShowTip] = useState(false);
  const categories = getLinksByCategory();

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36 max-sm:px-5 max-sm:py-16">
          {/* Page header */}
          <header className="mb-16 text-center sm:mb-24 max-sm:mb-12">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-500/80 uppercase dark:text-slate-400/60">
              {t("links.subhead")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl max-sm:text-3xl">
              {t("links.heading")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg max-sm:text-sm max-sm:mt-4">
              {t("links.intro")}
            </p>
          </header>

          {/* Categories */}
          {Array.from(categories.entries()).map(([category, categoryLinks]) => {
            const translatedCategory = t(
              CATEGORY_KEYS[category] || category,
              category
            );
            return (
              <section key={category} className="mb-16 sm:mb-20 max-sm:mb-12">
                <div className="mb-8 flex items-center gap-4">
                  <div className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
                  <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                    {translatedCategory}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryLinks.map((link, index) => (
                    <LinkCard key={link.name} link={link} index={index} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Apply button */}
          <div className="mt-12 flex justify-center">
            <Button
              onClick={() => setShowTip(true)}
              className="group relative overflow-hidden rounded-xl border border-slate-300/30 bg-slate-100/50 px-8 py-5 text-sm font-medium text-slate-700 backdrop-blur-md transition-all duration-300 hover:border-brand/25 hover:bg-slate-200/60 hover:text-slate-800 hover:shadow-[0_0_24px_rgba(var(--brand-rgb),0.08)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-foreground dark:hover:shadow-[0_0_24px_rgba(var(--brand-rgb),0.12)]"
            >
              <Mail className="mr-2 h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              {t("links.applyButton")}
            </Button>
          </div>
        </div>
      </div>

      {/* Tip modal */}
      <AnimatePresence>
        {showTip && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              onClick={() => setShowTip(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 z-[61] flex items-center justify-center p-4"
            >
              <div
                className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-2xl backdrop-blur-xl max-sm:max-w-[92vw] max-sm:p-5 dark:border-white/[0.08] dark:bg-[rgba(15,15,25,0.92)]"
                role="dialog"
                aria-modal="true"
                aria-label={t("links.applyTipTitle")}
              >
                <h3 className="mb-3 text-lg font-semibold text-foreground">
                  {t("links.applyTipTitle")}
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {t("links.applyTip")}
                </p>
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowTip(false)}
                    className="rounded-lg bg-brand/20 px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand/30"
                  >
                    {t("links.gotIt")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

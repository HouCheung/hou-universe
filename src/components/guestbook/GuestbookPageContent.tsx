"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { StarField } from "@/components/shared/StarField";
import { GuestbookForm } from "@/components/guestbook/GuestbookForm";
import { StarWall } from "@/components/guestbook/StarWall";
import { sampleMessages } from "@/data/guestbook";
import type { GuestbookMessage } from "@/types";

export function GuestbookPageContent() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<GuestbookMessage[]>(sampleMessages);

  const handleNewMessage = useCallback((message: GuestbookMessage) => {
    setMessages((prev) => [message, ...prev]);
  }, []);

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Page header */}
          <header className="mb-16 text-center sm:mb-24">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-500/80 uppercase dark:text-slate-400/60">
              {t("guestbook.subhead")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {t("guestbook.heading")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("guestbook.intro")}
            </p>
          </header>

          {/* Submit form */}
          <section className="mb-16 sm:mb-20">
            <div className="mb-8 flex items-center gap-4">
              <div className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
              <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                {t("guestbook.writeMessageTitle")}
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
            </div>
            <GuestbookForm onSuccess={handleNewMessage} />
          </section>

          {/* Star wall */}
          <section>
            <div className="mb-8 flex items-center gap-4">
              <div className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
              <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                {t("guestbook.footprintsTitle")}
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-100/50 dark:border-white/[0.04] dark:bg-slate-900/20">
              <StarWall messages={messages} />
            </div>
          </section>
        </div>
      </div>

      {/* Hidden static form for Netlify Forms detection */}
      <form
        name="guestbook"
        data-netlify="true"
        netlify-honeypot="bot-field"
        hidden
        aria-hidden="true"
      >
        <input type="text" name="nickname" />
        <textarea name="content" />
        <input type="hidden" name="form-name" value="guestbook" />
      </form>
    </>
  );
}

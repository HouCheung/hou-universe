"use client";

import { useTranslation } from "react-i18next";
import { ContactForm } from "@/components/shared/ContactForm";
import { ContactInfo } from "@/components/shared/ContactInfo";
import { DownloadVCardButton } from "@/components/contact/DownloadVCardButton";

export function ContactPageContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        {/* Page header */}
        <header className="mb-16 text-center sm:mb-24">
          <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-500/80 uppercase dark:text-slate-400/60">
            {t("contact.subhead")}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t("contact.heading")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("contact.intro")}
          </p>
        </header>

        {/* Two-column layout */}
        <div className="grid gap-12 lg:grid-cols-5 lg:gap-16">
          {/* Left: Contact form */}
          <div className="lg:col-span-3">
            <ContactForm />
          </div>

          {/* Right: Contact info cards */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <ContactInfo />
            <DownloadVCardButton />
          </div>
        </div>
      </div>

      {/* Hidden static form for Netlify Forms detection */}
      <form
        name="contact"
        data-netlify="true"
        netlify-honeypot="bot-field"
        hidden
        aria-hidden="true"
      >
        <input type="text" name="name" />
        <input type="email" name="email" />
        <textarea name="description" />
        <input type="file" name="attachment" />
        <input type="hidden" name="form-name" value="contact" />
      </form>
    </div>
  );
}

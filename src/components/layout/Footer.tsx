"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Github, Mail } from "lucide-react";
import { useVisitorStats } from "@/lib/useVisitorStats";

const FOOTER_KEY_MAP = [
  { href: "/", key: "nav.home" },
  { href: "/about", key: "nav.about" },
  { href: "/projects", key: "nav.projects" },
  { href: "/notes", key: "nav.notes" },
  { href: "/tools", key: "nav.tools" },
  { href: "/guestbook", key: "nav.guestbook" },
  { href: "/contact", key: "nav.contact" },
];

export function Footer() {
  const { t } = useTranslation();
  const { uvCount, pvCount } = useVisitorStats();

  return (
    <footer className="mt-auto">
      {/* Top divider */}
      <div className="border-t border-white/[0.06]" />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 max-sm:px-5 max-sm:py-10">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 max-sm:gap-6 max-sm:text-center">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-foreground transition-colors hover:text-brand dark:hover:text-slate-300"
            >
              HOU Universe
            </Link>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t("footer.description")}
            </p>
            {/* Social icon row — enhanced cosmic style */}
            <div className="mt-1 flex items-center gap-1">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group/social flex items-center gap-2 rounded-lg border border-slate-300/40 bg-slate-200/50 px-3 py-1.5 text-xs text-slate-800 transition-all duration-300 hover:border-brand/25 hover:bg-brand/8 hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-400 dark:hover:text-slate-200"
                aria-label="GitHub"
              >
                <Github className="h-3.5 w-3.5 transition-colors duration-300 group-hover/social:text-slate-900 dark:group-hover/social:text-slate-200" />
                <span>GitHub</span>
              </a>
              <a
                href="mailto:zhang13714579875@163.com"
                className="group/social flex items-center gap-2 rounded-lg border border-slate-300/40 bg-slate-200/50 px-3 py-1.5 text-xs text-slate-800 transition-all duration-300 hover:border-brand/25 hover:bg-brand/8 hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-400 dark:hover:text-slate-200"
                aria-label="Email"
              >
                <Mail className="h-3.5 w-3.5 transition-colors duration-300 group-hover/social:text-slate-900 dark:group-hover/social:text-slate-200" />
                <span>{t("footer.email")}</span>
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">{t("footer.quickLinks")}</h4>
            <ul className="flex flex-col gap-2">
              {FOOTER_KEY_MAP.map(({ href, key }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-slate-600 transition-colors hover:text-foreground dark:text-slate-400"
                  >
                    {t(key, { defaultValue: href })}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">{t("footer.contact")}</h4>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t("footer.contactText")}
            </p>
            <a
              href="mailto:zhang13714579875@163.com"
              className="text-sm text-slate-600 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300"
            >
              zhang13714579875@163.com
            </a>
          </div>
        </div>
      </div>

      {/* Copyright bar with visitor counter */}
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center sm:px-6 lg:px-8 max-sm:px-5 max-sm:py-3">
          <p className="text-xs text-slate-500 dark:text-slate-600 max-sm:leading-relaxed">
            &copy; {new Date().getFullYear()} HOU Universe. All rights reserved.
            {" "}
            <span className="text-slate-500/70 dark:text-slate-600/70">
              ｜ {t("footer.visitors")}
              <span className="text-slate-600 ml-0.5 tabular-nums dark:text-slate-500">
                {uvCount > 0 ? uvCount.toLocaleString() : "--"}
              </span>
              {" "}｜ {t("footer.visits")}
              <span className="text-slate-600 ml-0.5 tabular-nums dark:text-slate-500">
                {pvCount > 0 ? pvCount.toLocaleString() : "--"}
              </span>
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}

"use client";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import zhCN from "./locales/zh-CN.json";
import en from "./locales/en.json";

const resources = {
  "zh-CN": { translation: zhCN },
  en: { translation: en },
};

export const defaultNS = "translation";
export const defaultLng = "zh-CN";
export const supportedLngs = ["zh-CN", "en"] as const;
export type SupportedLng = (typeof supportedLngs)[number];

const isBrowser = typeof window !== "undefined";

// Initialize synchronously — always start with default language for SSR consistency.
// Language detection (localStorage / navigator) runs ONLY on the client AFTER mount,
// so the server-rendered HTML always uses zh-CN and the client hydrates with zh-CN
// first, then switches to the detected language. This eliminates hydration mismatches.
const i18n = i18next.createInstance();

// Build the plugin chain: only attach LanguageDetector in the browser.
// On the server we skip it so the initial render is always the default language.
if (isBrowser) {
  i18n.use(LanguageDetector);
}
i18n.use(initReactI18next);

i18n.init({
  resources,
  lng: defaultLng,
  fallbackLng: defaultLng,
  supportedLngs: supportedLngs as unknown as string[],
  defaultNS,
  interpolation: {
    escapeValue: false,
  },
  // Persist language changes to localStorage, but DO NOT auto-detect
  // on init (order: []). Detection is handled manually below to avoid
  // SSR hydration mismatches.
  detection: {
    order: [],
    caches: ["localStorage"],
    lookupLocalStorage: "hou-universe-lang",
  },
  returnObjects: true,
  react: {
    useSuspense: false,
  },
});

// On the client, detect + apply saved language after a microtask
// so the initial React render hydrates cleanly before the switch.
if (isBrowser) {
  // Wrap in setTimeout to defer past the initial hydration render
  setTimeout(() => {
    const stored = (window as unknown as Record<string, unknown>).localStorage
      ? localStorage.getItem("hou-universe-lang")
      : null;
    if (stored && (stored === "zh-CN" || stored === "en") && stored !== i18n.language) {
      i18n.changeLanguage(stored);
    }
  }, 0);
}

export function syncHtmlLang(lng: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng === "en" ? "en" : "zh-CN";
  }
}

export default i18n;

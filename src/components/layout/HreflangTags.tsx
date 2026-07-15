"use client";

import { useEffect, useState } from "react";
import i18n from "@/lib/i18n/config";

export function HreflangTags() {
  const [lang, setLang] = useState("zh-CN");

  useEffect(() => {
    setLang(i18n.language?.startsWith("en") ? "en" : "zh-CN");
    const handler = (lng: string) => setLang(lng.startsWith("en") ? "en" : "zh-CN");
    i18n.on("languageChanged", handler);
    return () => i18n.off("languageChanged", handler);
  }, []);

  const baseUrl = "https://hou-universe.vercel.app";

  return (
    <>
      <link
        rel="alternate"
        hrefLang="zh-CN"
        href={baseUrl}
      />
      <link
        rel="alternate"
        hrefLang="en"
        href={baseUrl}
      />
      <link
        rel="alternate"
        hrefLang={lang}
        href={baseUrl}
      />
      <link
        rel="alternate"
        hrefLang="x-default"
        href={baseUrl}
      />
    </>
  );
}

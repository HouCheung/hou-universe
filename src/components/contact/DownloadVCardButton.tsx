"use client";

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Download, IdCard } from "lucide-react";
import { downloadVCard } from "@/lib/vcard";
import { Card, CardContent } from "@/components/ui/card";

export function DownloadVCardButton() {
  const { t, i18n } = useTranslation();

  const handleDownload = () => {
    downloadVCard(i18n.language);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
    >
      <Card className="glass-card-hover overflow-hidden">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-blue-500 dark:text-[#60a5fa]">
            <IdCard className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              {t("vcard.title", "电子名片")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("vcard.description", "下载 vCard 文件，可导入手机通讯录")}
            </p>
          </div>
          <button
            onClick={handleDownload}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/10 px-4 py-2 text-sm font-medium text-blue-600 transition-all duration-300 hover:border-brand/35 hover:bg-brand/20 hover:text-blue-700 dark:text-[#93c5fd] dark:hover:text-[#bfdbfe]"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">{t("vcard.download", "下载名片")}</span>
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

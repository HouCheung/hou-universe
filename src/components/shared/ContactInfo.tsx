"use client";

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Mail, Github, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ContactItem {
  icon: typeof Mail;
  labelKey: string;
  value: string;
  valueKey?: string;
  href?: string;
  external?: boolean;
}

export function ContactInfo() {
  const { t } = useTranslation();

  const contactItems: ContactItem[] = [
    {
      icon: Mail,
      labelKey: "contact.info.email",
      value: "zhang13714579875@163.com",
      href: "mailto:zhang13714579875@163.com",
    },
    {
      icon: Github,
      labelKey: "contact.info.github",
      value: "github.com/hou-universe",
      href: "https://github.com/hou-universe",
      external: true,
    },
    {
      icon: Globe,
      labelKey: "contact.info.social",
      valueKey: "contact.info.socialValue",
      value: "更多渠道即将上线……",
    },
  ];

  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
    >
      {contactItems.map((item) => {
        const Icon = item.icon;
        const isLink = !!item.href;
        const displayValue = item.valueKey ? t(item.valueKey) : item.value;
        const displayLabel = t(item.labelKey);

        return (
          <Card
            key={item.labelKey}
            className="glass-card-hover overflow-hidden"
          >
            <CardContent className="flex items-start gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-200/50 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
                <Icon className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">
                  {displayLabel}
                </p>
                {isLink ? (
                  <a
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    className="truncate text-sm text-muted-foreground transition-colors hover:text-blue-600 dark:hover:text-[#93c5fd]"
                  >
                    {displayValue}
                  </a>
                ) : (
                  <p className="truncate text-sm text-muted-foreground">
                    {displayValue}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </motion.div>
  );
}

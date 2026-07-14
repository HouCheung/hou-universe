"use client";

import { motion } from "framer-motion";
import { Mail, Github, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ContactItem {
  icon: typeof Mail;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}

const contactItems: ContactItem[] = [
  {
    icon: Mail,
    label: "邮箱",
    value: "zhang13714579875@163.com",
    href: "mailto:zhang13714579875@163.com",
  },
  {
    icon: Github,
    label: "GitHub",
    value: "github.com/hou-universe",
    href: "https://github.com/hou-universe",
    external: true,
  },
  {
    icon: Globe,
    label: "社交",
    value: "更多渠道即将上线……",
  },
];

export function ContactInfo() {
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

        return (
          <Card
            key={item.label}
            className="glass-card-hover overflow-hidden"
          >
            <CardContent className="flex items-start gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-400/10 text-slate-300">
                <Icon className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">
                  {item.label}
                </p>
                {isLink ? (
                  <a
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    className="truncate text-sm text-muted-foreground transition-colors hover:text-slate-300"
                  >
                    {item.value}
                  </a>
                ) : (
                  <p className="truncate text-sm text-muted-foreground">
                    {item.value}
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

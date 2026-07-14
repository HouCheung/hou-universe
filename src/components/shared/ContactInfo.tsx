'use client';

import { motion } from 'framer-motion';
import { Mail, Github, Globe } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

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
    label: 'Email',
    value: 'hou.universe@example.com',
    href: 'mailto:hou.universe@example.com',
  },
  {
    icon: Github,
    label: 'GitHub',
    value: 'github.com/hou-universe',
    href: 'https://github.com/hou-universe',
    external: true,
  },
  {
    icon: Globe,
    label: 'Social',
    value: 'More channels coming soon...',
  },
];

export function ContactInfo() {
  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
    >
      {contactItems.map((item) => {
        const Icon = item.icon;
        const isLink = !!item.href;

        return (
          <Card
            key={item.label}
            className="transition-all duration-300 hover:border-blue-400/30 hover:bg-card/90 hover:shadow-[0_0_20px_rgba(96,165,250,0.06)]"
          >
            <CardContent className="flex items-start gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-300">
                <Icon className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">
                  {item.label}
                </p>
                {isLink ? (
                  <a
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={
                      item.external ? 'noopener noreferrer' : undefined
                    }
                    className="truncate text-sm text-muted-foreground transition-colors hover:text-blue-300"
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

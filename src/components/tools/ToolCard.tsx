"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { TiltCard } from "@/components/shared/TiltCard";
import type { Tool } from "@/types";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: i * 0.05 },
  }),
};

interface ToolCardProps {
  tool: Tool;
  index: number;
}

export function ToolCard({ tool, index }: ToolCardProps) {
  const { t } = useTranslation();
  const i18nBase = tool.id ? `toolsData.${tool.id}` : null;
  const displayName = i18nBase ? t(`${i18nBase}.name`, tool.name) : tool.name;
  const displayDesc = i18nBase ? t(`${i18nBase}.description`, tool.description) : tool.description;

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={cardVariants}
    >
      <TiltCard
        className="group/card glass-card flex flex-col rounded-2xl p-5 transition-all duration-300 ease-out hover:bg-white/[0.06] hover:border-brand/20 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(var(--brand-rgb),0.08),0_0_60px_rgba(var(--brand-rgb),0.03)]"
        intensity={0.05}
        glare={0.04}
      >
        <a
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground transition-colors group-hover/card:text-brand dark:group-hover/card:text-slate-200">
              {displayName}
            </h3>
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/card:text-brand dark:group-hover/card:text-brand/70 dark:group-hover/card:text-slate-300/70" />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {displayDesc}
          </p>
        </a>
      </TiltCard>
    </motion.div>
  );
}

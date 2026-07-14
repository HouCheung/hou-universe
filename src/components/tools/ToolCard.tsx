"use client";

import { motion, type Variants } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { Tool } from "@/types";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: i * 0.06 },
  }),
};

interface ToolCardProps {
  tool: Tool;
  index: number;
}

export function ToolCard({ tool, index }: ToolCardProps) {
  return (
    <motion.a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={cardVariants}
      className="group/card flex flex-col rounded-xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-blue-400/40 hover:shadow-[0_0_28px_rgba(96,165,250,0.12)]"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground transition-colors group-hover/card:text-blue-200">
          {tool.name}
        </h3>
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/card:text-blue-300/70" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {tool.description}
      </p>
    </motion.a>
  );
}

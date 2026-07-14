"use client";

import { motion, type Variants } from "framer-motion";
import { User } from "lucide-react";
import type { GuestbookMessage } from "@/types";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: i * 0.1 },
  }),
};

interface MessageCardProps {
  message: GuestbookMessage;
  index: number;
}

export function MessageCard({ message, index }: MessageCardProps) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={cardVariants}
      className="glass-card-hover flex gap-4 rounded-2xl p-5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-400/10 text-blue-300">
        <User className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {message.nickname}
          </span>
          <span className="text-xs text-muted-foreground">{message.date}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {message.content}
        </p>
      </div>
    </motion.div>
  );
}

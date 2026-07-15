"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Calendar, ArrowRight, Clock, Tag } from "lucide-react";
import { TiltCard } from "@/components/shared/TiltCard";
import type { Note } from "@/types";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: i * 0.05 },
  }),
};

interface NoteCardProps {
  note: Note;
  index: number;
}

export function NoteCard({ note, index }: NoteCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={cardVariants}
    >
      <TiltCard
        className="group/card glass-card flex flex-col rounded-2xl p-6 transition-all duration-300 ease-out hover:bg-white/[0.06] hover:border-brand/20 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(var(--brand-rgb),0.08),0_0_60px_rgba(var(--brand-rgb),0.03)]"
        intensity={0.05}
        glare={0.04}
      >
        {/* Meta row: date + reading time */}
        <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <time dateTime={note.date}>{note.date}</time>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {note.readingTime} {t("notes.readingTimeUnit")}
          </span>
        </div>

        {/* Categories */}
        {note.categories.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {note.categories.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center rounded-full border border-brand/20 bg-brand/5 px-2.5 py-0.5 text-[11px] font-medium text-brand dark:text-brand-light/90"
              >
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <Link href={`/notes/${note.slug}`} className="group/title">
          <h3 className="mb-2 text-lg font-semibold text-foreground transition-colors group-hover/title:text-brand dark:group-hover/title:text-slate-200">
            {note.title}
          </h3>
        </Link>

        {/* Summary */}
        <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
          {note.summary}
        </p>

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Tag className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] text-muted-foreground/60"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Read more */}
        <Link
          href={`/notes/${note.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700/90 transition-colors hover:text-blue-600 dark:text-slate-300/80 dark:hover:text-[#93c5fd]"
        >
          {t("notes.readMore")}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
        </Link>
      </TiltCard>
    </motion.div>
  );
}

"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Calendar, ArrowRight } from "lucide-react";
import type { Note } from "@/types";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: i * 0.08 },
  }),
};

interface NoteCardProps {
  note: Note;
  index: number;
}

export function NoteCard({ note, index }: NoteCardProps) {
  return (
    <motion.article
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={cardVariants}
      className="group/card flex flex-col rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-blue-400/40 hover:shadow-[0_0_28px_rgba(96,165,250,0.12)]"
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <time dateTime={note.date}>{note.date}</time>
      </div>

      <Link href={`/notes/${note.slug}`} className="group/title">
        <h3 className="mb-2 text-lg font-semibold text-foreground transition-colors group-hover/title:text-blue-200">
          {note.title}
        </h3>
      </Link>

      <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
        {note.summary}
      </p>

      <Link
        href={`/notes/${note.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-300/80 transition-colors hover:text-blue-200"
      >
        阅读全文
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
      </Link>
    </motion.article>
  );
}

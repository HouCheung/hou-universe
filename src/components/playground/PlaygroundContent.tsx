"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { Hash } from "lucide-react";
import { TiltCard } from "@/components/shared/TiltCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumberRush } from "@/components/playground/NumberRush";
import { cn } from "@/lib/utils";

const GAMES = [
  {
    id: "number-rush",
    icon: Hash,
    coverImage: "/images/playground/number-rush-cover.png",
    i18nKey: "playground.games.number-rush",
    href: null, // opens modal
  },
] as const;

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: "easeOut",
      delay: i * 0.08,
    },
  }),
};

const headerVariants: Variants = {
  hidden: { opacity: 0, y: -12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export function PlaygroundContent() {
  const { t } = useTranslation();
  const [numberRushOpen, setNumberRushOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      {/* ── Page header ── */}
      <motion.div
        className="mb-14 text-center"
        initial="hidden"
        animate="visible"
        variants={headerVariants}
      >
        <span className="inline-block font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {t("playground.subhead")}
        </span>
        <h1 className="mt-3 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          {t("playground.heading")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("playground.intro")}
        </p>
      </motion.div>

      {/* ── Game cards grid ── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6">
        {GAMES.map((game, index) => {
          const Icon = game.icon;
          const title = t(`${game.i18nKey}.title`);
          const description = t(`${game.i18nKey}.description`);
          const tag = t(`${game.i18nKey}.tag`);

          return (
            <motion.div
              key={game.id}
              custom={index}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={cardVariants}
            >
              <TiltCard
                className={cn(
                  "group/card glass-card flex flex-col rounded-2xl transition-all duration-300 ease-out",
                  "hover:bg-slate-100/80 hover:border-brand/20 dark:hover:bg-white/[0.06]",
                  "hover:shadow-[0_4px_16px_rgba(var(--brand-rgb),0.06)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(var(--brand-rgb),0.08),0_0_60px_rgba(var(--brand-rgb),0.03)]",
                )}
                intensity={0.06}
                glare={0.05}
              >
                {/* Cover image area */}
                <div className="relative h-44 overflow-hidden rounded-t-2xl bg-gradient-to-br from-slate-900/60 via-slate-800/40 to-background sm:h-48">
                  {"coverImage" in game ? (
                    <Image
                      src={game.coverImage as string}
                      alt={title}
                      fill
                      className="object-cover rounded-t-2xl"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  ) : (
                    <>
                      {/* Grid pattern background */}
                      <div
                        className="absolute inset-0 opacity-[0.06]"
                        style={{
                          backgroundImage:
                            "linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)",
                          backgroundSize: "24px 24px",
                        }}
                      />
                      {/* Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon className="h-14 w-14 text-slate-400/40 transition-transform duration-500 ease-out group-hover/card:scale-110 dark:text-slate-300/40" />
                      </div>
                    </>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
                </div>

                {/* Card body */}
                <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover/card:text-brand dark:group-hover/card:text-slate-200">
                    {title}
                  </h3>
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>

                  {/* Tag + Start button */}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Badge
                      variant="secondary"
                      className="text-[0.7rem] border-slate-300/30 bg-slate-100/50 transition-all duration-300 group-hover/card:border-brand/20 dark:border-white/[0.06] dark:bg-white/[0.04] dark:group-hover/card:border-white/[0.1]"
                    >
                      {tag}
                    </Badge>
                    <Button
                      variant="default"
                      size="sm"
                      className="transition-all duration-200"
                      onClick={() => setNumberRushOpen(true)}
                    >
                      {t("playground.startButton")}
                    </Button>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          );
        })}
      </div>

      {/* ── Number Rush Modal ── */}
      <NumberRush
        open={numberRushOpen}
        onClose={() => setNumberRushOpen(false)}
      />
    </div>
  );
}

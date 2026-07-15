"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowLeft, Home, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-[80vh] items-center justify-center overflow-hidden px-4">
      {/* Animated star dots background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-slate-400"
            style={{
              width: 2 + Math.random() * 3,
              height: 2 + Math.random() * 3,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0.1, 0.5, 0.1],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 2 + Math.random() * 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center text-center"
      >
        {/* Animated 404 */}
        <motion.p
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
          className="font-mono text-[8rem] font-bold leading-none tracking-tighter text-slate-500/15 dark:text-slate-300/20 sm:text-[10rem]"
          aria-hidden="true"
        >
          404
        </motion.p>

        {/* Cosmic stars decoration around 404 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="-mt-6 mb-2 flex items-center gap-3"
        >
          <Star className="h-4 w-4 text-slate-500/30 dark:text-slate-400/30" />
          <span className="h-px w-8 bg-gradient-to-r from-transparent via-slate-300/20 dark:via-slate-400/20 to-transparent" />
          <Star className="h-4 w-4 text-slate-500/25 dark:text-slate-400/20" />
          <span className="h-px w-8 bg-gradient-to-r from-transparent via-slate-300/20 dark:via-slate-400/20 to-transparent" />
          <Star className="h-4 w-4 text-slate-500/30 dark:text-slate-400/30" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
        >
          <span className="text-gradient-primary">
            {t("notFound.heading")}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {t("notFound.description")}
          <br />
          <span className="text-slate-600 dark:text-slate-500">{t("notFound.description2")}</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Button
            render={<Link href="/" />}
            variant="default"
            size="lg"
          >
            <Home className="mr-2 h-4 w-4" />
            {t("notFound.backHome")}
          </Button>
          <Button
            render={<Link href="/projects" />}
            variant="outline"
            size="lg"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("notFound.browseProjects")}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}

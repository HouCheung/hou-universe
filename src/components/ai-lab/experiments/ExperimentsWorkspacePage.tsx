"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import {
  ExperimentLauncher,
  ExperimentWorkspaceOverview,
} from "@/components/ai-lab/experiments";
import {
  launchExperiment,
  type LaunchConfig,
} from "@/lib/ai-lab/adapters/experimentLauncherAdapter";
import { Separator } from "@/components/ui/separator";

// ============================================================
// Animation variants
// ============================================================

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

// ============================================================
// ExperimentsWorkspacePage
// ============================================================

/**
 * ExperimentsWorkspacePage — the training experiment workspace.
 *
 * Composes:
 *   1. ExperimentLauncher — configure and launch training runs
 *   2. ExperimentWorkspaceOverview — recent, running, completed
 *
 * When a user launches:
 *   1. Calls launchExperiment() — real TrainingRuntime + Web Worker
 *   2. A ResearchExperiment + ResearchRun + ResearchSession are
 *      created and linked (identity chain preserved)
 *   3. Navigates to the detail page, which polls for live progress
 */
export function ExperimentsWorkspacePage({
  preselectedExperimentId,
}: {
  preselectedExperimentId?: string;
}) {
  const router = useRouter();
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);

  // Synchronous double-click guard — prevents two launches from racing
  // before the async `isLaunching` state propagates to the button.
  const launchingRef = useRef(false);

  const handleLaunch = useCallback(
    async (config: LaunchConfig) => {
      if (launchingRef.current) return;
      launchingRef.current = true;
      setIsLaunching(true);
      setLaunchMessage(null);

      try {
        const result = await launchExperiment(config);

        setLaunchMessage("Training started!");
        setTimeout(() => {
          router.push(`/ai-lab/lab/experiments/${result.experimentId}`);
        }, 300);
      } catch (error) {
        setLaunchMessage(
          `Launch failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        launchingRef.current = false;
        setIsLaunching(false);
      }
    },
    [router]
  );

  const handleViewExperiment = useCallback(
    (id: string) => {
      router.push(`/ai-lab/lab/experiments/${id}`);
    },
    [router]
  );

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      className="mx-auto max-w-4xl space-y-12 px-4 py-24 sm:px-6 sm:py-32 lg:px-8"
    >
      {/* ── Page header ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          Experiment Workspace
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          Configure and launch MiniMind training experiments. Select a
          model, choose a training recipe, set your parameters, and track
          results in real time.
        </p>
      </motion.div>

      {/* ── Launch message ── */}
      {launchMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-sm text-brand backdrop-blur-sm dark:border-brand/40 dark:bg-brand/[0.08]"
        >
          {launchMessage}
        </motion.div>
      )}

      {/* ── Experiment Launcher ── */}
      <section>
        <ExperimentLauncher
          onLaunch={handleLaunch}
          isLaunching={isLaunching}
        />
      </section>

      <Separator className="bg-slate-200/60 dark:bg-white/[0.06]" />

      {/* ── Experiment History Overview ── */}
      <section>
        <ExperimentWorkspaceOverview onViewExperiment={handleViewExperiment} />
      </section>
    </motion.div>
  );
}

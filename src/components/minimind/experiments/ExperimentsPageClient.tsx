"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExperimentHub } from "./ExperimentHub";
import { ExperimentWorkspace } from "./ExperimentWorkspace";

// ============================================================
// ExperimentsPageClient — Root state owner
// ============================================================
//
// Owns two pieces of state:
//   view                 — "hub" | "workspace"
//   selectedExperimentId — which experiment is active
//
// This is the sole state owner for the experiments page.
// No router, no context, no external state library.
// Matches ForwardPlayground's simplicity.
// ============================================================

export function ExperimentsPageClient() {
  const [view, setView] = useState<"hub" | "workspace">("hub");
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);

  const handleSelectExperiment = useCallback((id: string) => {
    setSelectedExperimentId(id);
    setView("workspace");
  }, []);

  const handleBackToHub = useCallback(() => {
    setView("hub");
    setSelectedExperimentId(null);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {view === "hub" && (
        <motion.div
          key="hub"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ExperimentHub onSelectExperiment={handleSelectExperiment} />
        </motion.div>
      )}

      {view === "workspace" && selectedExperimentId && (
        <motion.div
          key="workspace"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ExperimentWorkspace
            experimentId={selectedExperimentId}
            onBack={handleBackToHub}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

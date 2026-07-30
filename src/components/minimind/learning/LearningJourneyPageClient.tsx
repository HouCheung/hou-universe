"use client";

// ============================================================
// LearningJourneyPageClient — state owner for /ai-lab/journey
// ============================================================

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Sparkles, Route, X, ChevronRight } from "lucide-react";
import {
  MASTERY_TREE,
  getLearningPath,
  getLearningNode,
  getRecommendations,
  getOverallProgress,
  getPrerequisiteChain,
  type UserProgress,
  type OverallProgress,
  type PathType,
} from "@/data/minimind/learning-registry";
import { getNodeById as getKnowledgeNodeById } from "@/data/minimind/knowledge-registry";
import { LearningPathTimeline } from "./LearningPathTimeline";
import { RecommendationBar } from "./RecommendationBar";
import { ProgressDashboard } from "./ProgressDashboard";
import { cn } from "@/lib/utils";

// ============================================================
// localStorage helpers
// ============================================================

const STORAGE_KEY = "minimind-learning-progress";

function createInitialProgress(): UserProgress {
  return {
    nodeStatus: {},
    conceptReviewed: {},
    experimentCompleted: {},
    lastUpdated: new Date().toISOString(),
  };
}

function loadProgress(): UserProgress {
  if (typeof window === "undefined") return createInitialProgress();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw);
    if (parsed.v === 1) {
      return {
        nodeStatus: parsed.nodeStatus ?? {},
        conceptReviewed: parsed.conceptReviewed ?? {},
        experimentCompleted: parsed.experimentCompleted ?? {},
        lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
      };
    }
    return createInitialProgress();
  } catch {
    return createInitialProgress();
  }
}

function saveProgress(progress: UserProgress): void {
  if (typeof window === "undefined") return;
  try {
    const data = {
      v: 1,
      nodeStatus: progress.nodeStatus,
      conceptReviewed: progress.conceptReviewed,
      experimentCompleted: progress.experimentCompleted,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — silently degrade
  }
}

// ============================================================
// Animation variants
// ============================================================

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

// ============================================================
// Detail Panel
// ============================================================

function NodeDetailPanel({
  sourceId,
  progress,
  onClose,
  onToggleConcept,
  onToggleExperiment,
  onStartNode,
  onCompleteNode,
}: {
  sourceId: string;
  progress: UserProgress;
  onClose: () => void;
  onToggleConcept: (conceptId: string) => void;
  onToggleExperiment: (experimentId: string) => void;
  onStartNode: (sourceId: string) => void;
  onCompleteNode: (sourceId: string) => void;
}) {
  const learningNode = getLearningNode(sourceId);
  const knowledgeNode = getKnowledgeNodeById(sourceId);
  const chain = getPrerequisiteChain(sourceId);
  const status = progress.nodeStatus[sourceId] ?? "locked";

  if (!learningNode || !knowledgeNode) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        Node not found.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-brand/10 bg-background/95 p-6 shadow-2xl backdrop-blur-md dark:border-white/[0.06]"
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/[0.05] dark:hover:text-slate-300"
      >
        <X className="size-5" />
      </button>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/15 bg-brand/[0.04] px-2.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider text-brand">
            {knowledgeNode.type}
          </span>
          <h2 className="mt-2 text-xl font-bold text-foreground">
            {knowledgeNode.label}
          </h2>
          {knowledgeNode.metadata.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {knowledgeNode.metadata.description}
            </p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium",
              status === "completed" || status === "mastered"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                : status === "in_progress"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                  : status === "available"
                    ? "border-brand/20 bg-brand/10 text-brand"
                    : "border-slate-500/10 bg-slate-500/5 text-slate-400"
            )}
          >
            {status === "mastered"
              ? "Mastered"
              : status === "completed"
                ? "Completed"
                : status === "in_progress"
                  ? "In Progress"
                  : status === "available"
                    ? "Available"
                    : "Locked"}
          </span>
          <span className="text-[0.65rem] text-slate-400">
            ~{learningNode.estimatedMinutes} min
          </span>
        </div>

        {/* Prerequisite Chain */}
        {chain.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Prerequisite Chain
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {chain.map((n, i) => (
                <span key={n.sourceId} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[0.65rem]",
                      n.sourceId === sourceId
                        ? "border-brand/20 bg-brand/10 font-medium text-brand"
                        : "border-slate-500/10 text-slate-500"
                    )}
                  >
                    {n.knowledgeNode.label}
                  </span>
                  {i < chain.length - 1 && (
                    <ChevronRight className="size-3 text-slate-300" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Concepts */}
        {learningNode.conceptIds.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Concepts
            </h4>
            <div className="space-y-1.5">
              {learningNode.conceptIds.map((cid) => {
                const concept = getKnowledgeNodeById(cid);
                const reviewed = progress.conceptReviewed[cid] ?? false;
                return (
                  <button
                    key={cid}
                    onClick={() => onToggleConcept(cid)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      reviewed
                        ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-700 dark:text-emerald-300"
                        : "border-slate-500/10 bg-slate-500/[0.02] text-slate-600 dark:text-slate-400 hover:border-brand/15 hover:bg-brand/[0.02]"
                    )}
                  >
                    <span
                      className={cn(
                        "size-3 rounded border transition-colors",
                        reviewed
                          ? "border-emerald-500/40 bg-emerald-500/30"
                          : "border-slate-500/20"
                      )}
                    />
                    {concept?.label ?? cid}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Experiments */}
        {learningNode.experimentIds.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Experiments
            </h4>
            <div className="space-y-1.5">
              {learningNode.experimentIds.map((eid) => {
                const exp = getKnowledgeNodeById(eid);
                const completed = progress.experimentCompleted[eid] ?? false;
                return (
                  <button
                    key={eid}
                    onClick={() => onToggleExperiment(eid)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      completed
                        ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-700 dark:text-emerald-300"
                        : "border-slate-500/10 bg-slate-500/[0.02] text-slate-600 dark:text-slate-400 hover:border-amber-500/15 hover:bg-amber-500/[0.02]"
                    )}
                  >
                    <span
                      className={cn(
                        "size-3 rounded border transition-colors",
                        completed
                          ? "border-emerald-500/40 bg-emerald-500/30"
                          : "border-slate-500/20"
                      )}
                    />
                    {exp?.label ?? eid}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-slate-500/10 pt-4 dark:border-white/[0.05]">
          {status === "available" && (
            <button
              onClick={() => onStartNode(sourceId)}
              className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              Start Learning
            </button>
          )}
          {status === "in_progress" && (
            <button
              onClick={() => onCompleteNode(sourceId)}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Mark Complete
            </button>
          )}
          {status === "completed" && (
            <button
              onClick={() => onCompleteNode(sourceId)}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Mark Mastered
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// LearningJourneyPageClient
// ============================================================

export function LearningJourneyPageClient() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── State ──
  const [progress, setProgress] = useState<UserProgress>(createInitialProgress);
  const [activePathType, setActivePathType] = useState<PathType>("critical");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1024);

  // ── Load progress on mount ──
  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  // ── Resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setViewportWidth(entry.contentRect.width);
      }, 150);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // ── Persist progress on every change ──
  useEffect(() => {
    if (progress.lastUpdated) {
      saveProgress(progress);
    }
  }, [progress]);

  // ── Derived data ──
  const path = useMemo(
    () => getLearningPath(activePathType),
    [activePathType]
  );

  const recommendations = useMemo(
    () => getRecommendations(progress),
    [progress]
  );

  const overall = useMemo(
    (): OverallProgress => getOverallProgress(progress),
    [progress]
  );

  // ── Handlers ──
  const handleSelectNode = useCallback((sourceId: string) => {
    setSelectedNodeId(sourceId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleStartNode = useCallback(
    (sourceId: string) => {
      setProgress((prev) => {
        // Mark all prerequisites as completed first
        const nodeStatus: UserProgress["nodeStatus"] = { ...prev.nodeStatus };
        const node = getLearningNode(sourceId);
        if (node) {
          for (const prereqId of node.prerequisites) {
            if (nodeStatus[prereqId] !== "mastered") {
              nodeStatus[prereqId] = "completed";
            }
          }
        }
        nodeStatus[sourceId] = "in_progress";
        return {
          ...prev,
          nodeStatus,
          lastUpdated: new Date().toISOString(),
        };
      });
    },
    []
  );

  const handleCompleteNode = useCallback(
    (sourceId: string) => {
      setProgress((prev) => {
        const currentStatus = prev.nodeStatus[sourceId] ?? "locked";
        const newStatus =
          currentStatus === "completed" ? "mastered" : "completed";

        // If mastering, check for concept and experiment completion
        const nodeStatus: UserProgress["nodeStatus"] = {
          ...prev.nodeStatus,
          [sourceId]: newStatus,
        };
        const updated = {
          ...prev,
          nodeStatus,
          lastUpdated: new Date().toISOString(),
        };

        return updated;
      });
      setSelectedNodeId(null);
    },
    []
  );

  const handleToggleConcept = useCallback(
    (conceptId: string) => {
      setProgress((prev) => ({
        ...prev,
        conceptReviewed: {
          ...prev.conceptReviewed,
          [conceptId]: !prev.conceptReviewed[conceptId],
        },
        lastUpdated: new Date().toISOString(),
      }));
    },
    []
  );

  const handleToggleExperiment = useCallback(
    (experimentId: string) => {
      setProgress((prev) => ({
        ...prev,
        experimentCompleted: {
          ...prev.experimentCompleted,
          [experimentId]: !prev.experimentCompleted[experimentId],
        },
        lastUpdated: new Date().toISOString(),
      }));
    },
    []
  );

  // ── Path type tab labels ──
  const pathTypeLabels: Record<PathType, string> = {
    critical: "Recommended",
    breadth_first: "Breadth-First",
    experiment_first: "Hands-On",
  };

  return (
    <div
      ref={containerRef}
      className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20"
    >
      {/* ================================================================ */}
      {/* Page Header */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Label */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              {t("minimind.learning.subhead")}
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("minimind.learning.heading")}
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            {t("minimind.learning.intro")}
          </p>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Recommendations Bar */}
      {/* ================================================================ */}
      {recommendations.length > 0 && (
        <div className="mt-8">
          <RecommendationBar recommendations={recommendations} />
        </div>
      )}

      {/* ================================================================ */}
      {/* Path Type Tabs */}
      {/* ================================================================ */}
      <div className="mt-8 flex items-center gap-1">
        <Route className="mr-2 size-4 text-brand/60" />
        {(Object.keys(pathTypeLabels) as PathType[]).map((type) => (
          <button
            key={type}
            onClick={() => setActivePathType(type)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              activePathType === type
                ? "border-brand/20 bg-brand/10 text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            {pathTypeLabels[type]}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* Timeline + Dashboard */}
      {/* ================================================================ */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <div>
          <LearningPathTimeline
            path={path}
            progress={progress}
            viewportWidth={viewportWidth}
            onSelectNode={handleSelectNode}
          />
        </div>

        {/* Dashboard sidebar — on mobile, hidden or below */}
        <div className="hidden lg:block">
          <ProgressDashboard
            overall={overall}
            tree={MASTERY_TREE}
            progress={progress}
          />
        </div>
      </div>

      {/* Mobile dashboard */}
      <div className="mt-8 lg:hidden">
        <ProgressDashboard
          overall={overall}
          tree={MASTERY_TREE}
          progress={progress}
        />
      </div>

      {/* ================================================================ */}
      {/* Detail Slide-Out Panel */}
      {/* ================================================================ */}
      <AnimatePresence>
        {selectedNodeId && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={handleClosePanel}
            />
            <NodeDetailPanel
              sourceId={selectedNodeId}
              progress={progress}
              onClose={handleClosePanel}
              onToggleConcept={handleToggleConcept}
              onToggleExperiment={handleToggleExperiment}
              onStartNode={handleStartNode}
              onCompleteNode={handleCompleteNode}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

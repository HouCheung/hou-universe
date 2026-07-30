"use client";

// ============================================================
// LearningPathTimeline — vertical alternating timeline
// ============================================================

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type {
  LearningPath,
  UserProgress,
} from "@/data/minimind/learning-registry";
import { adaptTimeline, enrichPathNode } from "@/lib/minimind/learning";
import type { TimelineLayout } from "@/lib/minimind/learning";
import { PathNodeCard } from "./PathNodeCard";

// ============================================================
// Props
// ============================================================

interface LearningPathTimelineProps {
  path: LearningPath | undefined;
  progress: UserProgress;
  viewportWidth: number;
  onSelectNode: (sourceId: string) => void;
}

// ============================================================
// LearningPathTimeline
// ============================================================

export function LearningPathTimeline({
  path,
  progress,
  viewportWidth,
  onSelectNode,
}: LearningPathTimelineProps) {
  const { t } = useTranslation();

  const timeline: TimelineLayout | null = useMemo(
    () => (path ? adaptTimeline(path, viewportWidth) : null),
    [path, viewportWidth]
  );

  if (!path || !timeline || timeline.segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">
          {t("minimind.learning.empty")}
        </p>
      </div>
    );
  }

  const isMobile = viewportWidth < 640;

  return (
    <div className="relative py-8">
      {/* Center timeline line */}
      {!isMobile && (
        <div
          className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-gradient-to-b from-transparent via-brand/15 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Mobile: left-aligned line */}
      {isMobile && (
        <div
          className="absolute left-5 top-0 h-full w-px bg-gradient-to-b from-transparent via-brand/15 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Segments */}
      <div className="relative flex flex-col gap-6">
        {timeline.segments.map((segment, index) => {
          const status =
            progress.nodeStatus[segment.learningNode.sourceId] ?? "locked";
          const cardData = enrichPathNode(segment.learningNode, status);

          return (
            <motion.div
              key={segment.learningNode.sourceId}
              initial={{ opacity: 0, x: segment.isLeft ? -30 : 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.6,
                delay: index * 0.08,
                ease: "easeOut",
              }}
              className={`flex ${
                isMobile
                  ? "ml-10 justify-start"
                  : segment.isLeft
                    ? "justify-start pr-[calc(50%+2rem)]"
                    : "justify-end pl-[calc(50%+2rem)]"
              }`}
            >
              <div
                className={`w-full ${
                  isMobile ? "max-w-full" : "max-w-[280px]"
                }`}
              >
                {/* Connection dot on timeline */}
                {!isMobile && (
                  <div className="relative">
                    <div
                      className={`absolute top-6 ${
                        segment.isLeft
                          ? "-right-[calc(2rem+4px)]"
                          : "-left-[calc(2rem+4px)]"
                      } size-2 rounded-full border-2 border-brand/30 bg-background`}
                      aria-hidden="true"
                    />
                  </div>
                )}

                <PathNodeCard
                  data={cardData}
                  index={index}
                  onSelect={onSelectNode}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

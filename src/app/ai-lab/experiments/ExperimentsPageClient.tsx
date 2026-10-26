"use client";

// ============================================================
// ExperimentsPageClient — wraps ExperimentsWorkspacePage
// with cross-reference query parameter support (Phase 70)
// ============================================================

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ExperimentsWorkspacePage } from "@/components/ai-lab/experiments";

function ExperimentsPageContent() {
  const searchParams = useSearchParams();
  const experiment = searchParams.get("experiment") ?? undefined;
  return <ExperimentsWorkspacePage preselectedExperimentId={experiment} />;
}

export function ExperimentsPageClient() {
  return (
    <Suspense fallback={<div className="py-24" />}>
      <ExperimentsPageContent />
    </Suspense>
  );
}

"use client";

// ============================================================
// JourneyPageClient — wraps ProjectEvolutionPageClient
// with cross-reference query parameter support (Phase 70)
// ============================================================

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProjectEvolutionPageClient } from "@/components/minimind/evolution";

function JourneyPageContent() {
  const searchParams = useSearchParams();
  const highlightModule = searchParams.get("module") ?? undefined;
  return <ProjectEvolutionPageClient highlightModule={highlightModule} />;
}

export function JourneyPageClient() {
  return (
    <Suspense fallback={<div className="py-24" />}>
      <JourneyPageContent />
    </Suspense>
  );
}

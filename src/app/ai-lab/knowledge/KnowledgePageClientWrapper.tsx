"use client";

// ============================================================
// KnowledgePageClientWrapper — wraps KnowledgePageClient
// with cross-reference query parameter support (Phase 70)
// ============================================================

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { KnowledgePageClient } from "@/components/minimind/knowledge/KnowledgePageClient";

function KnowledgePageContent() {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") ?? undefined;
  return <KnowledgePageClient focusNodeId={focus} />;
}

export function KnowledgePageClientWrapper() {
  return (
    <Suspense fallback={<div className="py-24" />}>
      <KnowledgePageContent />
    </Suspense>
  );
}

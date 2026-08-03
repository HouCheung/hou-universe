"use client";

// ============================================================
// BreadcrumbBar — hierarchical breadcrumb for AI Lab sub-pages
// ============================================================
//
// Injected into ai-lab/layout.tsx to provide persistent
// breadcrumb navigation across all AI Lab sub-pages.
//
// Behavior:
//   - Hidden on /ai-lab (dashboard)
//   - Auto-derives breadcrumbs from pathname segments
//   - Renders: AI Lab > Section or AI Lab > Playground > Forward
//   - Last segment is non-clickable (current page)
//   - Matches the glass-card visual pattern
// ============================================================

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

// ============================================================
// Path segment → display label mapping
// ============================================================

const SEGMENT_LABELS: Record<string, string> = {
  journey: "Journey",
  knowledge: "Knowledge",
  experience: "Experience",
  experiments: "Experiments",
  playground: "Playground",
  forward: "Forward",
};

// ============================================================
// BreadcrumbBar
// ============================================================

export function BreadcrumbBar() {
  const pathname = usePathname();

  // ── Don't render on dashboard or non-AI-Lab pages ──
  if (pathname === "/ai-lab" || !pathname.startsWith("/ai-lab")) {
    return null;
  }

  // ── Build breadcrumb segments ──
  const segments = pathname.split("/").filter(Boolean);
  // e.g. ["ai-lab", "playground", "forward"]

  const breadcrumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = i === 0 ? "AI Lab" : (SEGMENT_LABELS[seg] ?? seg);
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 max-sm:px-5 max-sm:pt-5"
    >
      <ol className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {/* Separator */}
            {i > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-slate-400/50 dark:text-slate-500/50" />
            )}

            {crumb.isLast ? (
              <span className="font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-slate-500 transition-colors hover:text-brand dark:text-slate-400 dark:hover:text-brand-light"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

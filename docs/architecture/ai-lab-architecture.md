# AI Lab Architecture Decision Record

> Created: 2026-07-28 | Status: Accepted

## Context

HOU Universe is evolving from a personal portfolio into "HOU Universe · AI Lab" — a platform centered around the MiniMind source code learning journey. The AI Lab module is the first major expansion beyond the original portfolio scope. It must support progressive content growth across 10+ learning topics (Tokenizer → Agent) without requiring structural refactors.

---

## Decision 1: Extensible Route Layout Pattern

**Decision:** Use Next.js App Router nested layout (`src/app/ai-lab/layout.tsx`) with pre-created placeholder sub-routes.

**Rationale:**
- All future expansion paths (`/ai-lab/journey`, `/ai-lab/roadmap`, `/ai-lab/experiments`, `/ai-lab/playground`, `/ai-lab/blog`) exist as real routes from day one, each displaying a "Coming Soon" placeholder.
- When a section matures from skeleton to full content, its component moves from `AiLabClient.tsx` into the corresponding `page.tsx` — no refactoring needed.
- The shared `layout.tsx` provides consistent AI Lab visual framing (breadcrumb, theme accents, back-link) across all sub-routes.

**Alternatives considered:**
- All content in one page with `#hash` anchors → rejected, doesn't scale to independent sub-sections with unique metadata and deep-linking requirements.
- Dynamic route `[section]` → rejected, each section will have its own data dependencies and UI patterns; a catch-all would become a messy switch statement.

---

## Decision 2: Data-Driven Roadmap with Phase/Children Hierarchy

**Decision:** Single source of truth at `src/data/roadmap.ts` with `RoadmapPhase[]` containing nested `RoadmapNode[]` children. All consuming components read from this file; none own their own state.

**Rationale:**
- When learning progress updates, only `roadmap.ts` changes — no JSX edits needed.
- Phase-level grouping (Foundation → Training → Advanced) is semantic, matching the MiniMind curriculum structure.
- Helper functions (`getCurrentPhase()`, `getCurrentTask()`, `getOverallProgress()`) ensure consistent derived data across `MissionBar` (Hero) and AI Lab page sections.

**Alternatives considered:**
- Flat list of nodes with `phase` string tags → rejected, doesn't express parent-child containment or enable phase-level status querying.
- CMS/database → rejected for Phase 1; static file is simpler and version-controlled.

---

## Decision 3: Component-Section Parity

**Decision:** Every logical section of the AI Lab overview page has its own component file under `src/components/ai-lab/`. Each component is self-contained with its own imports and i18n usage.

**Rationale:**
- When a section graduates from skeleton to its own sub-route, the component file is moved (not rewritten) into the new `page.tsx`.
- Each component independently uses `useTranslation()`, avoiding prop-drilling translation keys.

---

## Decision 4: Skeleton-First Progressive Fill

**Decision:** Phase 1 delivers all sections as styled skeletons with titles, descriptions, and "Coming Soon" indicators. Content fills in incrementally across future phases.

**Rationale:**
- Establishes the information architecture immediately.
- Users see the full vision from launch.
- Each subsequent update is a targeted content fill, not a structural change.

---

## Decision 5: MissionBar as Shared Cross-Page Component

**Decision:** The `MissionBar` component lives in `src/components/shared/` (not `ai-lab/`) because it appears on both the Homepage Hero and potentially the AI Lab page itself.

**Rationale:**
- Shared location reflects its cross-cutting role as a "system status indicator."
- Reads from `roadmap.ts` directly — no props, no state synchronization between pages.

---

## Constraints

- All text must use i18n keys; no hardcoded Chinese or English strings.
- All components follow existing project patterns: function components, TypeScript, Tailwind CSS, Framer Motion.
- `npm run build` must pass with zero errors and zero warnings at every commit.
- Existing pages and components must not be modified beyond the minimal insertion points documented in the implementation plan.

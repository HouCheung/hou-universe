// ============================================================
// AI Lab Navigation Config — single source of truth
// ============================================================
//
// Every AI Lab navigation component imports from here.
// Add a new sub-page nav item in one place; FloatingNavDock,
// BreadcrumbBar, and future nav components pick it up.
// ============================================================

// ============================================================
// Types
// ============================================================

export interface NavItem {
  /** lucide-react icon name — resolved to component in consumers */
  icon: "Home" | "Map" | "Brain" | "Layers" | "FlaskConical" | "Gamepad2" | "Cpu" | "GraduationCap" | "Microscope";
  /** i18n key for the display label (e.g. "aiLab.nav.journey") */
  labelKey: string;
  /** Route path relative to site root */
  href: string;
}

// ============================================================
// Nav items
// ============================================================

export const AI_LAB_NAV_ITEMS: NavItem[] = [
  { icon: "Home", labelKey: "aiLab.nav.dashboard", href: "/ai-lab" },
  { icon: "Map", labelKey: "aiLab.nav.journey", href: "/ai-lab/lab/model" },
  { icon: "Brain", labelKey: "aiLab.nav.knowledge", href: "/ai-lab/knowledge" },
  { icon: "Layers", labelKey: "aiLab.nav.experience", href: "/ai-lab/experience" },
  { icon: "FlaskConical", labelKey: "aiLab.nav.experiments", href: "/ai-lab/lab/experiments" },
  { icon: "Gamepad2", labelKey: "aiLab.nav.playground", href: "/ai-lab/lab/architecture" },
  { icon: "Cpu", labelKey: "aiLab.nav.inference", href: "/ai-lab/inference" },
  { icon: "GraduationCap", labelKey: "aiLab.nav.training", href: "/ai-lab/lab/training" },
  { icon: "Microscope", labelKey: "aiLab.nav.research", href: "/ai-lab/research" },
];

// ============================================================
// Primary nav items — Phase 70: 5 core navigation links
// Displayed in FloatingNavDock as the main tier.
// Secondary items (inference, training, research) accessible
// via dashboard + direct URL.
// ============================================================

export const AI_LAB_PRIMARY_NAV_ITEMS: NavItem[] = [
  { icon: "Map", labelKey: "aiLab.nav.journey", href: "/ai-lab/lab/model" },
  { icon: "Brain", labelKey: "aiLab.nav.knowledge", href: "/ai-lab/knowledge" },
  { icon: "Layers", labelKey: "aiLab.nav.experience", href: "/ai-lab/experience" },
  { icon: "FlaskConical", labelKey: "aiLab.nav.experiments", href: "/ai-lab/lab/experiments" },
  { icon: "Gamepad2", labelKey: "aiLab.nav.playground", href: "/ai-lab/lab/architecture" },
];

// ============================================================
// Dock visibility — sub-pages only (not the /ai-lab dashboard)
// ============================================================

export const AI_LAB_DOCK_ROUTES: string[] = [
  "/ai-lab/lab/model",
  "/ai-lab/lab/architecture",
  "/ai-lab/lab/training",
  "/ai-lab/lab/generation",
  "/ai-lab/lab/research",
  "/ai-lab/research",
  "/ai-lab/lab/experiments",
  "/ai-lab/lab/evaluation",
  "/ai-lab/knowledge",
  "/ai-lab/experience",
  "/ai-lab/inference",
];

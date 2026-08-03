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
  icon: "Home" | "Map" | "Brain" | "Layers" | "FlaskConical" | "Gamepad2";
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
  { icon: "Map", labelKey: "aiLab.nav.journey", href: "/ai-lab/journey" },
  { icon: "Brain", labelKey: "aiLab.nav.knowledge", href: "/ai-lab/knowledge" },
  { icon: "Layers", labelKey: "aiLab.nav.experience", href: "/ai-lab/experience" },
  { icon: "FlaskConical", labelKey: "aiLab.nav.experiments", href: "/ai-lab/experiments" },
  { icon: "Gamepad2", labelKey: "aiLab.nav.playground", href: "/ai-lab/playground" },
];

// ============================================================
// Dock visibility — sub-pages only (not the /ai-lab dashboard)
// ============================================================

export const AI_LAB_DOCK_ROUTES: string[] = [
  "/ai-lab/journey",
  "/ai-lab/knowledge",
  "/ai-lab/experience",
  "/ai-lab/experiments",
  "/ai-lab/playground",
];

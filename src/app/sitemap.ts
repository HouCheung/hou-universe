import type { MetadataRoute } from "next";

import { getAllProjectIds } from "@/data/projects";
import { getNoteSlugs } from "@/lib/notes";
import { SITE_URL } from "@/lib/site";

interface StaticRoute {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}

/**
 * Public routes that render real content. Legacy alias routes
 * (/ai-lab/roadmap, /ai-lab/blog, …) are client-side redirects and the
 * experiment detail routes only prerender a local placeholder, so they are
 * intentionally excluded.
 */
const STATIC_ROUTES: StaticRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/projects", changeFrequency: "weekly", priority: 0.9 },
  { path: "/notes", changeFrequency: "weekly", priority: 0.7 },
  { path: "/ai-lab", changeFrequency: "weekly", priority: 0.8 },
  { path: "/ai-lab/research", changeFrequency: "weekly", priority: 0.8 },
  { path: "/ai-lab/experience", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/inference", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/knowledge", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/playground/forward", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/lab/architecture", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/lab/evaluation", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/lab/experiments", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/lab/generation", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/lab/model", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/lab/research", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ai-lab/lab/training", changeFrequency: "monthly", priority: 0.6 },
  { path: "/playground", changeFrequency: "monthly", priority: 0.6 },
  { path: "/tools", changeFrequency: "monthly", priority: 0.6 },
  { path: "/links", changeFrequency: "monthly", priority: 0.6 },
  { path: "/guestbook", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
];

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: route.path === "/" ? SITE_URL : `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const projectEntries: MetadataRoute.Sitemap = getAllProjectIds().map((id) => ({
    url: `${SITE_URL}/projects/${id}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const noteEntries: MetadataRoute.Sitemap = getNoteSlugs().map((slug) => ({
    url: `${SITE_URL}/notes/${slug}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...projectEntries, ...noteEntries];
}

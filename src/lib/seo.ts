import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

const OG_IMAGE = "/og-image.png";

interface PageMetadataOptions {
  title: string;
  description: string;
  /** Route path starting with "/" (for example "/about"). */
  path: string;
  /**
   * Optional title of the enclosing section. The AI Lab routes render their
   * document titles through the "AI Lab" title template, so Open Graph and
   * Twitter cards use the same suffix for consistency.
   */
  section?: "AI Lab" | "MiniMind Lab";
}

function absoluteUrl(path: string): string {
  if (path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function ogTitle(title: string, path: string, section?: string): string {
  if (path === "/") return "HOU Universe";
  return section
    ? `${title} | ${section} · HOU Universe`
    : `${title} | HOU Universe`;
}

/**
 * Build page-scoped metadata: canonical URL, Open Graph, and Twitter card.
 *
 * The site is a static export with a single URL per page (language is toggled
 * client-side), so every page declares a self-referencing canonical instead of
 * inheriting the site root.
 */
export function pageMetadata({
  title,
  description,
  path,
  section,
}: PageMetadataOptions): Metadata {
  const url = absoluteUrl(path);
  const socialTitle = ogTitle(title, path, section);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url,
      siteName: "HOU Universe",
      title: socialTitle,
      description,
      images: [
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}

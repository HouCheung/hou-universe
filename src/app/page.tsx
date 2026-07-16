import type { Metadata } from "next";
import { HomePageClient } from "./HomePageClient";

export const metadata: Metadata = {
  title: "HOU Universe",
  description:
    "A personal developer platform showcasing big data, AI, and full-stack projects. Explore interactive experiences, skill maps, and a continuously updated portfolio.",
};

export default function HomePage() {
  return <HomePageClient />;
}

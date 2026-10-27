import { HomePageClient } from "./HomePageClient";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "HOU Universe",
  description:
    "A personal developer platform showcasing big data, AI, and full-stack projects. Explore interactive experiences, skill maps, and a continuously updated portfolio.",
  path: "/",
});

export default function HomePage() {
  return <HomePageClient />;
}

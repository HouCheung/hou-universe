import { PlaygroundContent } from "@/components/playground/PlaygroundContent";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Playground",
  description:
    "Interactive algorithm lab — a collection of fun browser games blending data science concepts with playful interactions.",
  path: "/playground",
});

export default function PlaygroundPage() {
  return <PlaygroundContent />;
}

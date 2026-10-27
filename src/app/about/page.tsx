import { AboutContent } from "@/components/about/AboutContent";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "About",
  description:
    "Student of Data Science and Big Data Technology, passionate about full-stack development and AI engineering — here is my resume and comprehensive technical skill landscape.",
  path: "/about",
});

export default function AboutPage() {
  return <AboutContent />;
}

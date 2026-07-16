import type { Metadata } from "next";
import { AboutContent } from "@/components/about/AboutContent";

export const metadata: Metadata = {
  title: "About - HOU Universe",
  description:
    "Student of Data Science and Big Data Technology, passionate about full-stack development and AI engineering — here is my resume and comprehensive technical skill landscape.",
};

export default function AboutPage() {
  return <AboutContent />;
}

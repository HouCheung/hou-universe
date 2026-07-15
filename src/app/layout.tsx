import type { Metadata } from "next";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { PageTransition } from "@/components/layout/PageTransition";
import { I18nProvider } from "@/components/layout/I18nProvider";
import { NebulaGlow } from "@/components/shared/NebulaGlow";
import { MouseTrail } from "@/components/shared/MouseTrail";
import { StarField } from "@/components/shared/StarField";
import { BackToTop } from "@/components/shared/BackToTop";
import { ScrollProgress } from "@/components/shared/ScrollProgress";
import { CardClickRipple } from "@/components/shared/CardClickRipple";
import { HoverStarParticles } from "@/components/shared/HoverStarParticles";
import { Terminal } from "@/components/shared/Terminal";
import { EntranceSequence } from "@/components/shared/EntranceSequence";
import { HreflangTags } from "@/components/layout/HreflangTags";
import { UmamiAnalytics } from "@/components/layout/UmamiAnalytics";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";
import { Geist } from "next/font/google";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "HOU Universe",
    template: "%s | HOU Universe",
  },
  description:
    "HOU Universe is a personal developer platform showcasing big data, AI, and full-stack projects. Explore interactive experiences, skill maps, and a continuously updated portfolio.",
  keywords: [
    "developer",
    "portfolio",
    "full-stack",
    "big data",
    "AI",
    "machine learning",
    "Next.js",
    "TypeScript",
    "React",
  ],
  authors: [{ name: "HOU", url: "https://hou-universe.vercel.app" }],
  creator: "HOU",
  metadataBase: new URL("https://hou-universe.vercel.app"),
  alternates: {
    languages: {
      "zh-CN": "https://hou-universe.vercel.app",
      en: "https://hou-universe.vercel.app",
    },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://hou-universe.vercel.app",
    siteName: "HOU Universe",
    title: "HOU Universe — Personal Developer Platform",
    description:
      "A personal full-stack developer platform showcasing big data, AI, and full-stack projects. Build, explore, create.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HOU Universe — Personal Developer Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HOU Universe — Personal Developer Platform",
    description:
      "A personal full-stack developer platform showcasing big data, AI, and full-stack projects.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="dark" className={`dark font-sans ${geist.variable}`} suppressHydrationWarning>
      <head>
        <HreflangTags />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased flex flex-col overflow-x-hidden">
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>
        <I18nProvider>
          <UmamiAnalytics />
          <ThemeProvider>
          <EntranceSequence>
            <NebulaGlow />
            <StarField />
            <MouseTrail />
            <CardClickRipple />
            <HoverStarParticles />
            <NavBar />
            <main id="main-content" className="flex-1">
              <PageTransition>{children}</PageTransition>
            </main>
            <Footer />
            <BackToTop />
            <ScrollProgress />
            <Terminal />
          </EntranceSequence>
          </ThemeProvider>
          </I18nProvider>
      </body>
    </html>
  );
}

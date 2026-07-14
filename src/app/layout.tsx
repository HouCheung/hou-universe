import type { Metadata } from "next";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { PageTransition } from "@/components/layout/PageTransition";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "HOU Universe",
    template: "%s | HOU Universe",
  },
  description:
    "HOU Universe is a personal developer platform showcasing projects in big data, AI, and full-stack development. Explore interactive experiences, skill maps, and a growing portfolio.",
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
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://hou-universe.vercel.app",
    siteName: "HOU Universe",
    title: "HOU Universe — Personal Developer Platform",
    description:
      "A personal developer platform showcasing projects in big data, AI, and full-stack development. Build, explore, create.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HOU Universe",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HOU Universe — Personal Developer Platform",
    description:
      "A personal developer platform showcasing projects in big data, AI, and full-stack development.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className="min-h-screen bg-background font-sans antialiased flex flex-col overflow-x-hidden">
        <NavBar />
        <main className="flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </body>
    </html>
  );
}

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
    "HOU Universe 是个人开发者全功能平台，展示大数据、AI 与全栈开发项目。探索互动体验、技能地图与持续更新的作品集。",
  keywords: [
    "开发者",
    "作品集",
    "全栈",
    "大数据",
    "AI",
    "机器学习",
    "Next.js",
    "TypeScript",
    "React",
  ],
  authors: [{ name: "HOU", url: "https://hou-universe.vercel.app" }],
  creator: "HOU",
  metadataBase: new URL("https://hou-universe.vercel.app"),
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://hou-universe.vercel.app",
    siteName: "HOU Universe",
    title: "HOU Universe — 个人开发者平台",
    description:
      "个人开发者全功能平台，展示大数据、AI 与全栈开发项目。构建、探索、创造。",
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
    title: "HOU Universe — 个人开发者平台",
    description:
      "个人开发者全功能平台，展示大数据、AI 与全栈开发项目。",
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
    <html lang="zh-CN" className={cn("dark", "font-sans", geist.variable)}>
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

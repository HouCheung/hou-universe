export interface LinkItem {
  name: string;
  description: string;
  url: string;
  icon?: string;
  category: "friend" | "tool";
}

export const linkItems: LinkItem[] = [
  // ── 友情链接 ──
  {
    name: "HOU Universe",
    description: "个人开发者全功能平台，探索数据科学、AI 工程化与全栈开发的无限可能",
    url: "https://hou-universe.vercel.app",
    category: "friend",
  },

  // ── 工具导航 ──
  {
    name: "Vercel",
    description: "下一代前端部署平台，支持 Next.js 等现代框架的无缝部署与边缘函数",
    url: "https://vercel.com",
    category: "tool",
  },
  {
    name: "shadcn/ui",
    description: "基于 Radix UI + Tailwind CSS 的组件库，可复制粘贴使用、高度可定制",
    url: "https://ui.shadcn.com",
    category: "tool",
  },
  {
    name: "Tailwind CSS",
    description: "实用优先的 CSS 框架，支持快速构建现代化 UI 界面",
    url: "https://tailwindcss.com",
    category: "tool",
  },
  {
    name: "Next.js",
    description: "React 全栈框架，支持 SSR/SSG/ISR 多种渲染策略与 App Router 架构",
    url: "https://nextjs.org",
    category: "tool",
  },
  {
    name: "Framer Motion",
    description: "React 动画库，提供声明式 API 驱动高性能交互动效与页面过渡",
    url: "https://www.framer.com/motion",
    category: "tool",
  },
];

export function getLinksByCategory(): Map<string, LinkItem[]> {
  const map = new Map<string, LinkItem[]>();
  for (const link of linkItems) {
    const list = map.get(link.category) || [];
    list.push(link);
    map.set(link.category, list);
  }
  return map;
}

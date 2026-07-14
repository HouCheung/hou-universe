import type { Project } from "@/types";

export const projects: Project[] = [
  {
    id: "hou-universe",
    title: "HOU Universe",
    description:
      "个人开发者全功能平台，集作品展示、项目管理与互动体验于一体——基于现代 Web 技术从零构建。",
    fullDescription:
      "HOU Universe 是我的个人开发者全功能平台，也是技术能力与工程化思维的集中展示。平台采用 Next.js 15 App Router 架构，以 TypeScript 严格模式编写，使用 Tailwind CSS 构建深黑 + 冷白 + 淡蓝高亮的统一设计语言。从星空粒子背景到鼠标光晕交互，从打字机动画到滚动驱动的视差效果，每一个细节都追求极致体验。平台涵盖个人介绍、技能地图、项目展示、联系方式等完整模块，支持全响应式适配，所有动画基于 Framer Motion 实现，保证 60fps 流畅运行。",
    tags: ["Next.js", "TypeScript", "Tailwind CSS", "Framer Motion", "Base UI"],
    coverImage: "/images/project-3.svg",
    techStack: [
      "Next.js 15",
      "TypeScript",
      "Tailwind CSS",
      "Framer Motion",
      "Base UI",
      "shadcn/ui",
      "Lucide Icons",
      "Vercel",
    ],
    liveUrl: "/",
    downloadUrl: "/downloads/hou-universe.zip",
    demoUrl: "https://hou-universe.vercel.app",
    githubUrl: "https://github.com/hou-universe/hou-universe",
    createdAt: "2026-05-01",
    updateLog: [
      {
        version: "v1.3.0",
        date: "2026-07-14",
        changes: [
          "新增 Projects 项目展示模块，含列表页与详情页",
          "实现项目卡片 hover 上浮微光效果与滚动入场动画",
          "详情页支持更新日志时间轴展示",
        ],
      },
      {
        version: "v1.2.0",
        date: "2026-06-10",
        changes: [
          "新增 About 页面，包含成长轨迹时间轴与技能地图",
          "实现滚动驱动的垂直时间线进度动画",
          "技能标签组支持分类展示与响应式网格布局",
        ],
      },
      {
        version: "v1.0.0",
        date: "2026-05-20",
        changes: [
          "平台首个版本上线，包含首页 Hero 区域与星空背景",
          "实现导航栏、页脚等全局布局组件",
          "完成 Contact 联系页面基础结构",
        ],
      },
    ],
  },
  {
    id: "online-judge-platform",
    title: "在线刷题平台",
    description:
      "面向开发者的交互式在线刷题平台，支持多语言编程、实时判题与进度追踪——助力技术面试准备。",
    fullDescription:
      "在线刷题平台是一个面向开发者的交互式刷题网站，支持 JavaScript、Python、Java 等多语言在线编码。平台内置丰富的算法题库，涵盖数组、链表、树、动态规划等经典分类，提供实时代码判题与测试用例验证功能。用户可以按难度筛选题目、收藏经典题型、追踪个人刷题进度。前端采用 React + TypeScript 构建，后端基于 Node.js 实现判题沙箱，致力于为开发者提供流畅高效的刷题体验。",
    tags: ["React", "TypeScript", "Node.js", "Monaco Editor", "Docker"],
    coverImage: "/images/project-1.svg",
    techStack: [
      "React 18",
      "TypeScript",
      "Node.js",
      "Monaco Editor",
      "Docker",
      "PostgreSQL",
      "Redis",
    ],
    liveUrl: "#",
    downloadUrl: "/downloads/online-judge-platform.zip",
    demoUrl: "",
    githubUrl: "https://github.com/hou-universe/online-judge-platform",
    createdAt: "2026-06-15",
    updateLog: [
      {
        version: "v1.0.0",
        date: "2026-06-15",
        changes: [
          "首个版本上线，支持 JavaScript/Python/Java 在线编码",
          "内置 50+ 算法题目，涵盖数组、链表、树等经典分类",
          "实现实时判题与测试用例验证功能",
        ],
      },
    ],
  },
];

export function getProjectById(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

export function getAllProjectIds(): string[] {
  return projects.map((p) => p.id);
}

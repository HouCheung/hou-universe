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
    title: "刷题助手 PRO MAX",
    description:
      "一款专注编程学习的在线刷题练习平台，支持文本粘贴与文件导入双模式批量导入题目，自带智能格式识别；内置错题本、我的收藏、专项练习模块，搭配答题计时、正确率统计与数据统计功能，帮助高效巩固知识点，提升刷题效率。",
    fullDescription:
      "刷题助手 PRO MAX 是一款专注编程学习的在线刷题练习平台。支持文本粘贴与文件导入双模式批量导入题目，自带智能格式识别，自动解析题目、选项与答案。内置错题本自动收录答错题目，我的收藏方便回顾重点题型，专项练习模块支持按分类针对性训练。答题计时与正确率统计功能帮助学生实时掌握学习进度，数据统计面板直观展示刷题趋势。前端采用原生 JavaScript 构建，后端基于 Node.js + Express 框架，MySQL 存储题库与用户数据，致力于为编程学习者提供高效便捷的刷题体验。",
    tags: ["JavaScript", "Node.js", "MySQL"],
    coverImage: "/images/project-1.svg",
    techStack: [
      "JavaScript",
      "Node.js",
      "Express",
      "MySQL",
      "HTML5",
      "CSS3",
    ],
    liveUrl: "",
    downloadUrl: "/downloads/online-judge-platform.zip",
    demoUrl: "",
    githubUrl: "https://github.com/hou-universe/online-judge-platform",
    createdAt: "2026-06-15",
    updateLog: [
      {
        version: "v1.0.0",
        date: "2026-06-15",
        changes: [
          "首个版本上线，支持文本粘贴与文件导入双模式批量导入题目",
          "内置错题本、我的收藏、专项练习三大学习模块",
          "实现答题计时、正确率统计与数据统计面板功能",
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

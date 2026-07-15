import type { Project } from "@/types";

export const projects: Project[] = [
  {
    id: "hou-universe",
    title: "HOU Universe",
    category: "全栈开发",
    description:
      "个人开发者全功能平台，集作品展示、项目管理与互动体验于一体——基于现代 Web 技术从零构建。",
    fullDescription:
      "HOU Universe 是我的个人技术作品集网站，以宇宙主题打造个人品牌展示空间。平台基于 Next.js 15 App Router 架构，TypeScript 严格模式编写，融合 Tailwind CSS 与玻璃拟态设计语言，构建深黑 + 冷白 + 淡蓝高亮的统一视觉体系。从星空粒子背景到鼠标光晕交互，从打字机动画到滚动驱动视差效果，每一个细节追求极致。涵盖项目展示、技能可视化、留言联系、中英双语支持、访客统计等完整功能模块，支持全响应式适配。",
    detail: {
      background:
        "作为个人开发者，需要一个集中展示技术能力、项目成果与学习历程的平台。HOU Universe 由此诞生——它不仅是一个作品集网站，更是个人技术品牌的展示空间。以深空宇宙为视觉主题，从需求到实现全程采用 AI 工程化工作流开发，将传统数周的工作量压缩至数天完成，同时保持高质量的代码规范与用户体验。",
      coreFeatures: [
        "项目作品展示：精选项目卡片带封面图、技术标签与下载按钮，详情页包含完整技术方案与更新日志时间轴",
        "技能可视化：分级进度条展示四大技能类别（编程语言 / 数据库 / 核心能力 / AI 工程化），滚动触发百分比增长动画",
        "留言联系系统：Netlify Forms 集成留言墙与联系表单，支持文件附件上传与自动邮件通知",
        "中英双语支持：基于 i18next 的完整国际化方案，覆盖全站所有文本内容",
        "访客统计：实时访客计数与页面访问量统计，数据持久化存储",
        "深空宇宙主题：三层视差星空背景、3D 星球模型、鼠标光晕追踪、玻璃拟态设计语言、全响应式适配",
      ],
      techSolution:
        "前端基于 Next.js 15 App Router 架构，TypeScript 严格模式保证类型安全。样式层使用 Tailwind CSS + shadcn/ui (Base UI) 组件体系，CSS 自定义属性统一深色主题 Token。动画层统一 Framer Motion 管理页面过渡、滚动入场与交互反馈，Canvas API 实现高性能星空粒子系统，Three.js (React Three Fiber) 驱动 3D 星球元素。国际化基于 i18next + react-i18next，支持 zh-CN / en 双语。构建输出为全静态站点 (output: export)，部署于 Netlify 平台，采用 AI 工程化工作流（Claude Code + Harness 方法论）驱动开发全流程。",
      highlights: [
        "深空宇宙主题视觉：三层视差星空背景、3D 星球模型、鼠标粒子引力交互与点击星爆特效，营造沉浸式宇宙空间体验",
        "3D 交互元素：Three.js (R3F) 驱动首屏 3D 星球，Canvas 高性能粒子系统，触摸设备自动降级动效保证流畅",
        "玻璃拟态设计语言：全站统一的 glass-card 风格，backdrop-blur 毛玻璃效果搭配 brand 品牌色微光边框",
        "全响应式适配：移动端 / 平板 / 桌面端完美适配，所有交互动效基于 Framer Motion 实现 60fps 流畅运行",
      ],
    },
    tags: ["Next.js", "TypeScript", "Tailwind CSS", "Framer Motion", "Base UI"],
    coverImage: "/images/projects/hou-universe-preview.png",
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
    id: "shuatiapp-pro-max",
    title: "刷题助手 PRO MAX",
    category: "全栈开发",
    description:
      "一款专注编程学习的在线刷题练习平台，支持文本粘贴与文件导入双模式批量导入题目，自带智能格式识别；内置错题本、我的收藏、专项练习模块，搭配答题计时、正确率统计与数据统计功能，帮助高效巩固知识点，提升刷题效率。",
    fullDescription:
      "刷题助手 PRO MAX 是一款面向编程学习的在线刷题练习平台，核心解决批量导入题目难、错题整理效率低的痛点。支持文本粘贴与文件导入双模式批量导题，内置智能格式识别自动解析题目、选项与答案。错题本自动收录答错题目，我的收藏方便回顾重点题型，专项练习模块支持按分类针对性训练。答题计时与正确率统计功能帮助学生实时掌握学习进度，数据统计面板直观展示刷题趋势。前端采用原生 JavaScript 构建，后端基于 Node.js + Express 框架，MySQL 存储题库与用户数据，致力于为编程学习者提供高效便捷的刷题体验。",
    detail: {
      background:
        "编程学习中，刷题是巩固知识的核心手段，但传统方式存在题目来源分散、错题管理不便、学习进度难追踪等痛点。刷题助手 PRO MAX 应运而生，面向编程学习者提供从题目导入到数据分析的一站式刷题体验，解决批量导入题目难、错题整理效率低的核心问题，让学习者专注于练习本身而非工具切换。",
      coreFeatures: [
        "双模式批量导题：支持文本粘贴与文件导入（CSV/JSON），智能格式识别自动解析题干、选项与正确答案，大幅降低题目录入成本",
        "错题本自动收录：答错题目自动加入错题本，支持按分类筛选、按时间排序，方便针对性复习薄弱知识点",
        "题目收藏模块：手动收藏重点题型与高频考点，快速回顾核心题目，避免信息过载",
        "专项练习分类：按数据结构、算法、数据库等分类进行针对性训练，自由选择练习范围与题量",
        "答题计时系统：每道题自动计时，记录答题耗时，帮助培养时间管理意识与考场节奏感",
        "正确率与数据统计：正确率趋势、分类掌握度雷达图、每日刷题量柱状图，直观呈现学习进展",
      ],
      techSolution:
        "前端采用原生 JavaScript + HTML5 + CSS3 构建，不依赖重型框架，确保加载速度与兼容性。后端基于 Node.js + Express 框架提供 RESTful API 接口，前后端分离架构，表单校验保障数据有效性。MySQL 数据库存储题库、用户数据与学习记录，数据持久化保障。智能格式识别模块通过正则表达式 + 规则引擎解析多种题目格式（纯文本、CSV、JSON），自动映射为标准数据结构。答题计时基于前端时间戳记录，正确率统计通过 SQL 聚合查询实时计算。整体架构轻量模块化，方便后续功能扩展。",
      highlights: [
        "双模式导题降低录入成本：文本粘贴 + 文件导入双通道，智能格式识别准确率 > 95%，覆盖主流刷题平台导出格式",
        "错题 + 收藏 + 专项三维度巩固练习：错题自动收录、重点题型收藏、分类专项训练，三维度构建完整的练习闭环",
        "数据统计可视化掌握学习进度：正确率趋势、分类掌握度、刷题量趋势三大图表，帮助学生精准定位薄弱环节",
        "模块化扩展架构：前端静态资源缓存策略保障弱网可用，错题本、收藏、专项练习三大模块独立解耦，新增功能无需修改核心代码",
      ],
    },
    tags: ["JavaScript", "Node.js", "MySQL"],
    coverImage: "/images/projects/quiz-assistant-preview.png",
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

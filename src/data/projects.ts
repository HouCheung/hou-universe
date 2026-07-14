import type { Project } from "@/types";

export const projects: Project[] = [
  {
    id: "hou-universe",
    title: "HOU Universe",
    description:
      "个人开发者全功能平台，集作品展示、项目管理与互动体验于一体——基于现代 Web 技术从零构建。",
    fullDescription:
      "HOU Universe 是我的个人开发者全功能平台，也是技术能力与工程化思维的集中展示。平台采用 Next.js 15 App Router 架构，以 TypeScript 严格模式编写，使用 Tailwind CSS 构建深黑 + 冷白 + 淡蓝高亮的统一设计语言。从星空粒子背景到鼠标光晕交互，从打字机动画到滚动驱动的视差效果，每一个细节都追求极致体验。平台涵盖个人介绍、技能地图、项目展示、联系方式等完整模块，支持全响应式适配，所有动画基于 Framer Motion 实现，保证 60fps 流畅运行。",
    detail: {
      background:
        "作为个人开发者，需要一个集中展示技术能力、项目成果与学习历程的全功能平台。HOU Universe 应运而生——它不仅是一个作品集网站，更是我践行 AI 工程化工作流的试验田。从需求分析到代码实现，从自动化部署到持续迭代，整个开发过程深度集成了 Claude Code 等 AI Agent 工具，将传统数周的工作量压缩至数天完成，同时保持高质量的代码规范与用户体验。",
      coreFeatures: [
        "深空宇宙主题设计：三层视差星空背景、鼠标光晕追踪、粒子引力交互与点击星爆特效，营造沉浸式宇宙空间体验",
        "打字机动画首屏：标题逐字浮现 + 多角色循环打字效果，配合 Framer Motion 交错入场动画，打造电影级开场",
        "项目作品展示：精选项目卡片带封面图、技术标签、下载按钮，支持详情页查看完整技术方案与更新日志",
        "技能可视化：分级进度条展示四大技能类别（编程语言 / 数据库 / 核心能力 / AI 工程化），滚动触发百分比增长动画",
        "Netlify 联系表单：集成 Netlify Forms 实现无后端表单提交，支持文件附件上传，自动邮件通知",
        "全站响应式适配：移动端 / 平板 / 桌面端完美适配，触摸设备自动降级动效，保证性能与体验平衡",
      ],
      techSolution:
        "前端基于 Next.js 15 App Router 架构，采用 TypeScript 严格模式确保类型安全。样式层使用 Tailwind CSS + shadcn/ui (Base UI) 组件体系，通过 CSS 自定义属性实现统一的深色主题 Token。动画层统一使用 Framer Motion 管理页面过渡、滚动入场与交互反馈，Canvas API 实现高性能星空粒子系统。Three.js (React Three Fiber) 驱动首屏 3D 星球元素。构建输出为全静态站点 (output: export)，部署于 Netlify 平台，通过 GitHub 持续集成实现推送即部署的自动化工作流。",
      highlights: [
        "AI 工程化开发：全程使用 Claude Code 辅助编码，通过高质量 Prompt 驱动 AI 完成组件生成、样式调整、Bug 修复与性能优化",
        "模块化架构设计：组件高度解耦，数据层与视图层分离，新增页面只需添加数据条目与路由即可自动渲染",
        "性能极致优化：静态导出确保首屏加载 < 1s，Canvas 动画智能暂停不可见标签页，触摸设备自动降级 3D 与粒子特效",
        "无障碍与 SEO：语义化 HTML 标签、ARIA 属性、Open Graph 元标签，Lighthouse 评分接近满分",
      ],
    },
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
    id: "shuatiapp-pro-max",
    title: "刷题助手 PRO MAX",
    description:
      "一款专注编程学习的在线刷题练习平台，支持文本粘贴与文件导入双模式批量导入题目，自带智能格式识别；内置错题本、我的收藏、专项练习模块，搭配答题计时、正确率统计与数据统计功能，帮助高效巩固知识点，提升刷题效率。",
    fullDescription:
      "刷题助手 PRO MAX 是一款专注编程学习的在线刷题练习平台。支持文本粘贴与文件导入双模式批量导入题目，自带智能格式识别，自动解析题目、选项与答案。内置错题本自动收录答错题目，我的收藏方便回顾重点题型，专项练习模块支持按分类针对性训练。答题计时与正确率统计功能帮助学生实时掌握学习进度，数据统计面板直观展示刷题趋势。前端采用原生 JavaScript 构建，后端基于 Node.js + Express 框架，MySQL 存储题库与用户数据，致力于为编程学习者提供高效便捷的刷题体验。",
    detail: {
      background:
        "编程学习中，刷题是巩固知识点的核心手段，但传统刷题方式存在题目来源分散、错题管理不便、学习进度难追踪等痛点。刷题助手 PRO MAX 应运而生——它提供从题目导入到数据分析的一站式刷题体验，让学习者专注于练习本身而非工具切换，帮助高效提升编程能力与应试水平。",
      coreFeatures: [
        "双模式批量导入：支持文本粘贴（手动输入题目文本）与文件上传（CSV/JSON），智能识别题目格式、自动解析题干、选项与正确答案",
        "错题本自动收录：答错的题目自动加入错题本，支持按分类筛选、按时间排序，方便针对性复习薄弱知识点",
        "我的收藏模块：手动收藏重点题型与高频考点，快速回顾核心题目，避免题海战术中的信息过载",
        "专项练习模式：按题目分类（如数据结构、算法、数据库等）进行针对性训练，自由选择练习范围与题量",
        "答题计时系统：每道题自动计时，记录答题耗时，帮助培养时间管理意识与考场节奏感",
        "数据统计面板：正确率趋势图、分类掌握度雷达图、每日刷题量柱状图，直观呈现学习进展与薄弱环节",
      ],
      techSolution:
        "前端采用原生 JavaScript + HTML5 + CSS3 构建，不依赖重型框架，确保加载速度与兼容性。后端基于 Node.js + Express 框架提供 RESTful API 接口，MySQL 数据库存储题库、用户数据与学习记录。智能格式识别模块通过正则表达式 + 规则引擎解析多种题目格式（纯文本、CSV、JSON），自动映射为标准数据结构。答题计时基于前端时间戳记录，正确率统计通过 SQL 聚合查询实时计算。整体架构轻量化、模块化，方便后续功能扩展与技术栈升级。",
      highlights: [
        "智能格式识别：覆盖常见刷题平台导出的多种题目格式，识别准确率 > 95%，大幅降低手动录入成本",
        "离线友好设计：前端静态资源缓存策略确保弱网环境可用，核心刷题流程不依赖实时网络连接",
        "数据驱动学习：基于刷题历史生成个性化学习报告，帮助学生精准定位薄弱环节，有的放矢地复习",
        "模块化扩展架构：错题本、收藏、专项练习三大模块独立解耦，新增功能无需修改核心代码",
      ],
    },
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

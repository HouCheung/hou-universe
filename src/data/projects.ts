import type { Project } from "@/types";

export const projects: Project[] = [
  {
    id: "realtime-data-pipeline",
    title: "Real-time Data Pipeline",
    description:
      "A high-throughput real-time data processing platform that ingests, transforms, and analyzes streaming data at scale — built for production-grade observability.",
    fullDescription:
      "Real-time Data Pipeline 是一个面向企业级场景的流式数据处理平台。系统以 Apache Kafka 作为消息总线，Spark Streaming 与 Flink 协同完成实时计算，计算结果写入 HBase 供下游服务毫秒级查询，同时将原始数据持久化到 HDFS 数据湖中供离线分析。整个平台采用 Docker Compose 编排，支持一键部署，已在模拟的千万级日活埋点场景下通过压力测试。项目涵盖了从数据接入、Schema 校验、流式聚合、异常检测到可视化大屏的完整链路，是大数据工程能力的综合体现。",
    tags: ["Kafka", "Spark Streaming", "Flink", "HBase", "HDFS", "Docker"],
    coverImage: "",
    techStack: [
      "Java 17",
      "Scala 2.13",
      "Apache Kafka 3.x",
      "Apache Spark 3.x",
      "Apache Flink 1.x",
      "HBase 2.x",
      "Hadoop HDFS",
      "Docker Compose",
      "Grafana",
      "Prometheus",
    ],
    demoUrl: "",
    githubUrl: "https://github.com/hou-universe/realtime-data-pipeline",
    createdAt: "2025-09-15",
    updateLog: [
      {
        version: "v1.2.0",
        date: "2026-06-20",
        changes: [
          "新增 Flink CEP 复杂事件处理模块，支持多条件组合规则",
          "重构监控面板，迁移至 Grafana Dashboard 统一展示",
          "修复 Kafka 消费组 rebalance 时的 offset 提交竞态问题",
        ],
      },
      {
        version: "v1.1.0",
        date: "2026-03-10",
        changes: [
          "引入 Protobuf 序列化替代 JSON，吞吐量提升 40%",
          "新增数据质量校验层，支持字段级 Schema 验证与异常分流",
          "完善 Docker Compose 编排，实现一键启动全集群",
        ],
      },
      {
        version: "v1.0.0",
        date: "2025-11-01",
        changes: [
          "首个稳定版本发布，支持 Kafka → Spark Streaming → HBase 核心链路",
          "实现 Exactly-Once 语义保证",
          "完成千万级日活埋点场景压力测试",
        ],
      },
    ],
  },
  {
    id: "ai-image-studio",
    title: "AI Image Studio",
    description:
      "An interactive web application for AI-powered image generation and editing, combining Stable Diffusion with an intuitive React-based creative workflow.",
    fullDescription:
      "AI Image Studio 是一个面向创作者与开发者的 AI 图像生成与编辑平台。前端使用 React + Tailwind CSS 构建了直观的创作工作流界面，支持文生图、图生图、局部重绘等核心功能。后端基于 FastAPI 搭建，集成了 Stable Diffusion 模型推理管线，通过 Redis 队列异步处理生成任务，支持批量提交与进度轮询。项目还实现了 Prompt 模板库、历史记录管理、图片对比模式等特色功能，旨在降低 AI 图像创作的门槛，让更多人能够轻松上手。",
    tags: ["PyTorch", "Stable Diffusion", "FastAPI", "React", "Redis", "Docker"],
    coverImage: "",
    techStack: [
      "Python 3.11",
      "PyTorch 2.x",
      "Stable Diffusion XL",
      "FastAPI",
      "React 18",
      "Tailwind CSS",
      "Redis",
      "PostgreSQL",
      "Docker",
      "Nginx",
    ],
    demoUrl: "https://ai-image-studio.vercel.app",
    githubUrl: "https://github.com/hou-universe/ai-image-studio",
    createdAt: "2026-01-20",
    updateLog: [
      {
        version: "v2.0.0",
        date: "2026-07-01",
        changes: [
          "模型升级至 Stable Diffusion XL，生成质量大幅提升",
          "新增局部重绘（Inpainting）功能，支持蒙版编辑",
          "前端重构为 Next.js App Router 架构",
        ],
      },
      {
        version: "v1.5.0",
        date: "2026-04-15",
        changes: [
          "新增 Prompt 模板库与社区分享功能",
          "优化生成队列，支持并行推理与优先级调度",
          "添加图片对比模式，支持前后版本差异高亮",
        ],
      },
      {
        version: "v1.0.0",
        date: "2026-02-28",
        changes: [
          "首个公开版本，支持文生图与图生图基础功能",
          "完成前端创作工作流与后端推理管线联调",
          "部署至 Vercel + GPU 云服务器",
        ],
      },
    ],
  },
  {
    id: "hou-universe",
    title: "HOU Universe",
    description:
      "A personal developer platform that unifies portfolio showcase, project management, and interactive experiences — built from scratch with modern web technologies.",
    fullDescription:
      "HOU Universe 是我的个人开发者全功能平台，也是技术能力与工程化思维的集中展示。平台采用 Next.js 15 App Router 架构，以 TypeScript 严格模式编写，使用 Tailwind CSS 构建深黑 + 冷白 + 淡蓝高亮的统一设计语言。从星空粒子背景到鼠标光晕交互，从打字机动画到滚动驱动的视差效果，每一个细节都追求极致体验。平台涵盖个人介绍、技能地图、项目展示、联系方式等完整模块，支持全响应式适配，所有动画基于 Framer Motion 实现，保证 60fps 流畅运行。",
    tags: ["Next.js", "TypeScript", "Tailwind CSS", "Framer Motion", "Base UI"],
    coverImage: "",
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
    id: "devtoolkit-cli",
    title: "DevToolkit CLI",
    description:
      "A cross-platform command-line developer toolkit that automates repetitive workflows — from project scaffolding to one-click deployment — boosting daily productivity.",
    fullDescription:
      "DevToolkit CLI 是一款面向开发者的跨平台命令行工具箱，旨在用一套统一命令简化日常开发中的重复性工作。工具基于 Go 语言与 Cobra 框架构建，提供了项目脚手架生成、Docker 容器管理、Git 工作流自动化、API 接口测试、环境变量管理等实用子命令。CLI 采用插件化架构设计，用户可通过 YAML 配置文件自定义命令模板与工作流。内置 SQLite 本地数据库用于缓存与状态持久化，支持命令别名与自动补全，大幅提升终端操作效率。",
    tags: ["Go", "CLI", "Docker", "Cobra", "DevOps"],
    coverImage: "",
    techStack: [
      "Go 1.22",
      "Cobra",
      "Docker SDK",
      "SQLite",
      "GitHub API",
      "YAML",
      "Makefile",
      "Homebrew",
    ],
    demoUrl: "",
    githubUrl: "https://github.com/hou-universe/devtoolkit-cli",
    createdAt: "2025-12-01",
    updateLog: [
      {
        version: "v1.3.0",
        date: "2026-05-10",
        changes: [
          "新增 `toolkit env` 环境变量管理子命令，支持 .env 模板生成",
          "优化自动补全脚本，支持 zsh / bash / fish 三种 Shell",
          "新增 Homebrew 安装方式，支持 macOS 一键安装",
        ],
      },
      {
        version: "v1.1.0",
        date: "2026-02-15",
        changes: [
          "新增 `toolkit docker` 容器管理命令组",
          "引入插件化架构，支持 YAML 自定义命令模板",
          "添加命令执行耗时统计与彩色输出",
        ],
      },
      {
        version: "v1.0.0",
        date: "2026-01-10",
        changes: [
          "首个正式版本，包含项目脚手架、Git 工作流、API 测试三大模块",
          "支持 SQLite 本地缓存与命令别名",
          "发布至 GitHub Releases 与 Go 模块索引",
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

import type { TimelineItem, SkillCategory } from "@/types";

export const timelineData: TimelineItem[] = [
  {
    id: "t1",
    year: "2024 Q3",
    title: "入读广东技术师范大学",
    description:
      "怀揣对数据科学的热情踏入大学校门，就读数据科学与大数据技术专业，正式开启技术探索之旅。",
  },
  {
    id: "t2",
    year: "2024 Q4",
    title: "Java 与 C 语言入门",
    description:
      "系统学习 Java 与 C 语言核心语法，掌握面向对象编程思想、集合框架、异常处理与指针操作，为后续系统级开发打下坚实基础。",
  },
  {
    id: "t3",
    year: "2025 Q1",
    title: "Python 与数据科学入门",
    description:
      "深入 Python 生态，从基础语法到数据分析三剑客（NumPy、Pandas、Matplotlib），感受 Python 在数据科学与自动化领域的强大能力。",
  },
  {
    id: "t4",
    year: "2025 Q2",
    title: "首个全栈项目实践",
    description:
      "独立完成第一个全栈项目，从数据库建模到后端接口再到前端界面，首次体验了将想法完整落地的成就感。",
  },
  {
    id: "t5",
    year: "2025 Q3",
    title: "大数据技术栈入门",
    description:
      "系统接触 Hadoop、Spark、Hive 等大数据生态组件，理解分布式计算原理，开始能处理 TB 级别数据并从中提取有价值的信息。",
  },
  {
    id: "t6",
    year: "2025 Q4 — 2026 Q2",
    title: "AI 工程化与项目实践",
    description:
      "全面投入 AI 工程化实践，熟练使用 Claude Code 等 AI Agent 工具，掌握 Harness 工程思想，独立完成多个数据分析与系统开发项目。",
  },
  {
    id: "t7",
    year: "2026 Q3 — 现在",
    title: "构建个人开发者平台",
    description:
      "整合所学技术栈，构建个人开发者平台 HOU Universe，追求全栈能力闭环。持续关注前沿技术，以工程化思维推动个人成长与项目交付。",
  },
];

export const skillTreeData: SkillCategory[] = [
  {
    id: "programming",
    title: "编程语言",
    icon: "💻",
    skills: [
      { name: "Python", label: "精通" },
      { name: "Java", label: "精通" },
      { name: "C", label: "熟练" },
      { name: "TypeScript", label: "熟练" },
      { name: "SQL", label: "熟练" },
    ],
  },
  {
    id: "ai",
    title: "AI 工程化",
    icon: "🤖",
    skills: [
      { name: "Claude Code", label: "精通" },
      { name: "Harness 工程思想", label: "熟练" },
      { name: "Prompt Engineering", label: "熟练" },
      { name: "多 Agent 协同", label: "熟练" },
      { name: "Trae Work", label: "熟悉" },
      { name: "模型部署与调试", label: "熟悉" },
    ],
  },
  {
    id: "bigdata",
    title: "数据工程",
    icon: "📊",
    skills: [
      { name: "ETL 管线设计", label: "熟练" },
      { name: "数据采集与清洗", label: "精通" },
      { name: "数据分析与可视化", label: "熟练" },
      { name: "MySQL", label: "熟练" },
      { name: "NoSQL", label: "熟悉" },
      { name: "RFM / K-Means", label: "熟悉" },
    ],
  },
  {
    id: "frontend",
    title: "前端与工具",
    icon: "🎨",
    skills: [
      { name: "React / Next.js", label: "熟练" },
      { name: "Tailwind CSS", label: "熟练" },
      { name: "Framer Motion", label: "熟悉" },
      { name: "shadcn/ui", label: "熟练" },
      { name: "Git / CI-CD", label: "熟练" },
      { name: "Figma / 原型设计", label: "了解" },
    ],
  },
];

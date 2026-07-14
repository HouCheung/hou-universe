import type { TimelineItem, SkillCategory } from "@/types";

export const timelineData: TimelineItem[] = [
  {
    id: "t1",
    year: "2024",
    title: "入学",
    description:
      "怀揣对计算机科学的热情踏入大学校门，正式开启技术探索之旅。从最基础的计算机导论课程起步，逐步建立对编程世界的系统认知。",
  },
  {
    id: "t2",
    year: "2024 Q4",
    title: "Java 入门",
    description:
      "系统学习 Java 编程语言，掌握面向对象编程核心思想、集合框架、异常处理与多线程基础，为后续企业级开发打下坚实基础。",
  },
  {
    id: "t3",
    year: "2025 Q1",
    title: "Python 学习",
    description:
      "深入 Python 生态，从基础语法到数据分析三剑客（NumPy、Pandas、Matplotlib），感受 Python 在数据科学与自动化领域的强大能力。",
  },
  {
    id: "t4",
    year: "2025 Q2",
    title: "首个实战项目",
    description:
      "独立完成第一个全栈项目，从前端界面设计到后端接口开发再到数据库建模，第一次体验了将一个想法完整落地的成就感。",
  },
  {
    id: "t5",
    year: "2025 Q3",
    title: "大数据技术栈",
    description:
      "系统接触 Hadoop、Spark、Hive 等大数据生态组件，理解分布式计算原理，开始能够处理 TB 级别的数据并从中提取有价值的洞察。",
  },
  {
    id: "t6",
    year: "2025 Q4 — 2026 Q2",
    title: "AI 探索",
    description:
      "全面投入人工智能领域，学习深度学习、自然语言处理与计算机视觉，熟练使用 PyTorch 框架，参与多个 AI 相关的实验项目与竞赛。",
  },
  {
    id: "t7",
    year: "2026 Q3 — 现在",
    title: "当前阶段",
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
      { name: "Java", label: "精通" },
      { name: "Python", label: "精通" },
      { name: "TypeScript", label: "熟练" },
      { name: "SQL", label: "熟练" },
      { name: "Scala", label: "了解" },
      { name: "Go", label: "了解" },
    ],
  },
  {
    id: "ai",
    title: "AI",
    icon: "🤖",
    skills: [
      { name: "PyTorch", label: "熟练" },
      { name: "NLP", label: "熟悉" },
      { name: "Computer Vision", label: "了解" },
      { name: "LLM / Prompt Engineering", label: "熟练" },
      { name: "Scikit-learn", label: "熟悉" },
      { name: "Agent Framework", label: "了解" },
    ],
  },
  {
    id: "bigdata",
    title: "大数据",
    icon: "📊",
    skills: [
      { name: "Hadoop", label: "熟悉" },
      { name: "Spark", label: "熟练" },
      { name: "Hive", label: "熟悉" },
      { name: "HBase", label: "了解" },
      { name: "Flink", label: "了解" },
      { name: "Kafka", label: "熟悉" },
    ],
  },
  {
    id: "frontend",
    title: "前端",
    icon: "🎨",
    skills: [
      { name: "React / Next.js", label: "熟练" },
      { name: "Tailwind CSS", label: "熟练" },
      { name: "Framer Motion", label: "熟悉" },
      { name: "shadcn/ui", label: "熟练" },
      { name: "Node.js", label: "熟悉" },
      { name: "Git / CI-CD", label: "熟练" },
    ],
  },
];

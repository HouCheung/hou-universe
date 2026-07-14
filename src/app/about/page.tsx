import type { Metadata } from "next";
import { SkillProgressBar } from "@/components/shared/SkillProgressBar";
import { skillLevelData } from "@/data/about";

export const metadata: Metadata = {
  title: "关于 - HOU Universe",
  description:
    "数据科学与大数据技术专业在读，热爱全栈开发与 AI 工程化——这里是我的个人简历与技术能力全景。",
};

const courses = [
  "数据结构与算法",
  "操作系统原理",
  "计算机网络",
  "数据库系统原理",
  "C / Python / Java 程序设计",
  "算法设计与分析",
  "大数据技术与应用",
  "数据挖掘",
  "NoSQL 数据库",
];

const projects = [
  {
    title: "千万级电商用户行为全链路分析与可视化系统",
    role: "独立开发",
    period: "2026.05 — 2026.06",
    desc: "基于海量用户行为日志，借助 Claude Code 辅助开发并践行 Harness 工程思想，构建从数据接入到策略输出的全链路分析系统；设计六步 ETL 清洗管线，搭建 RFM 评分模型结合 K-Means 聚类实现用户分层，输出可视化图表与可执行运营建议。",
  },
  {
    title: "Java I/O 流性能测试与分析系统",
    role: "独立开发",
    period: "2026.05",
    desc: "设计自动化性能测试框架，对比不同 I/O 方案在多规格文件下的性能表现，通过 15 组对比实验量化分析，得出不同场景下的 I/O 选型结论，为实际开发提供数据支撑。",
  },
  {
    title: "产学研合作系列项目（大健康 / 高科农业）",
    role: "技术研发助理",
    period: "2026.01 — 2026.03",
    desc: "参与需求调研与实地考察，协助构建检测数据集，完成 300 余张图像标注；查阅行业文献整理成文，协助运行模型测试并整理统计报表，完成技术方案与阶段性报告归档。",
  },
  {
    title: "基于 MySQL 的仓库管理系统",
    role: "项目成员",
    period: "2025.12",
    desc: "面向中小仓储场景，设计四张核心数据表并建立外键关联，开发仓库、货物、库存、出入库四大管理模块，使用事务机制保障多仓库调拨的数据一致性。",
  },
];

const aiSkills = [
  "熟练使用 Claude Code、Trae Work 等 AI Agent 开发工具，搭建多 Agent 协同编程工作流",
  "掌握 Harness 工程思想，通过高质量提示词驱动 AI 完成代码生成、调试与重构，提升开发效率",
  "擅长将复杂项目拆解为标准化工程流程，实现模块解耦与环境无关部署",
];

const campusActivities = [
  {
    title: "院学生会文娱部 · 部长",
    period: "2024.09 — 2026.07",
    desc: "统筹两院联合歌手大赛全流程，负责选手筛选、评委邀约与现场分工；牵头组织 4 场「课后一首歌」专场活动；建立班级信息传达机制，保障通知全覆盖。",
  },
];

function SectionDivider({ label, icon, enLabel }: { label: string; icon: string; enLabel?: string }) {
  return (
    <div className="mb-10 flex items-center gap-4 sm:mb-14">
      {/* Vertical gradient accent line */}
      <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
      <div className="flex flex-col gap-0.5">
        {enLabel && (
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-slate-400/30 sm:text-[0.65rem]">
            {enLabel}
          </span>
        )}
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          <span className="text-xl" role="img" aria-hidden="true">
            {icon}
          </span>
          {label}
        </h2>
      </div>
      <span className="ml-auto h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        {/* Page header */}
        <header className="mb-16 text-center sm:mb-24">
          <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-400/60 uppercase">
            关于
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            关于我
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            数据科学与大数据技术专业在读，热爱全栈开发与 AI 工程化。
            持续探索技术边界，以工程化思维驱动每一个项目的落地与迭代。
          </p>
        </header>

        {/* ========== ① 教育背景 ========== */}
        <section className="mb-20 sm:mb-32">
          <SectionDivider label="教育背景" icon="🎓" enLabel="Education" />

          <div className="glass-card-hover rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  广东技术师范大学
                </h3>
                <p className="mt-1 text-base text-slate-300/80">
                  数据科学与大数据技术 · 本科
                </p>
              </div>
              <span className="inline-block shrink-0 rounded-full bg-slate-400/10 px-4 py-1.5 font-mono text-sm font-medium text-slate-300/90 sm:self-start">
                2024.09 — 2028.06
              </span>
            </div>

            <div className="mt-6">
              <h4 className="mb-3 text-sm font-semibold text-foreground">
                主修课程
              </h4>
              <div className="flex flex-wrap gap-2">
                {courses.map((course) => (
                  <span
                    key={course}
                    className="inline-flex items-center rounded-lg border border-border/50 bg-secondary/50 px-3 py-1.5 text-sm text-foreground transition-all duration-200 hover:border-slate-400/40 hover:bg-slate-400/8 hover:shadow-[0_0_12px_rgba(100,116,139,0.10)]"
                  >
                    {course}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ========== ② 项目经历 ========== */}
        <section className="mb-20 sm:mb-32">
          <SectionDivider label="项目经历" icon="💼" enLabel="Projects" />

          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[15px] top-0 h-full w-px bg-border sm:left-[19px]" />

            <div className="flex flex-col gap-8">
              {projects.map((project, index) => (
                <div
                  key={index}
                  className="relative flex gap-5 pl-10 sm:gap-6 sm:pl-14"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-[11px] top-2 h-2.5 w-2.5 rounded-full border-2 border-slate-400 bg-background ring-4 ring-background sm:left-[15px]" />

                  {/* Card */}
                  <div className="glass-card-hover flex-1 rounded-2xl p-5 sm:p-6">
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="rounded-full bg-slate-400/10 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-300/90">
                        {project.period}
                      </span>
                      <span className="text-xs font-medium text-slate-300/60">
                        {project.role}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {project.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {project.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== ③ AI 工程化能力 ========== */}
        <section className="mb-20 sm:mb-32">
          <SectionDivider label="AI 工程化能力" icon="🤖" enLabel="AI Engineering" />

          <div className="grid gap-4 sm:grid-cols-3">
            {aiSkills.map((skill, index) => (
              <div
                key={index}
                className="glass-card-hover rounded-2xl p-6"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-400/10 text-slate-300">
                  <span className="text-lg font-bold" aria-hidden="true">
                    {index === 0 ? "🔧" : index === 1 ? "🧠" : "📐"}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {skill}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ========== ④ 校园实践 ========== */}
        <section className="mb-20 sm:mb-32">
          <SectionDivider label="校园实践" icon="🎭" enLabel="Campus" />

          <div className="flex flex-col gap-6">
            {campusActivities.map((activity, index) => (
              <div
                key={index}
                className="glass-card-hover rounded-2xl p-6 sm:p-7"
              >
                <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {activity.title}
                  </h3>
                  <span className="rounded-full bg-slate-400/10 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-300/90">
                    {activity.period}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {activity.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ========== ⑤ 专业技能（可视化升级）========== */}
        <section>
          <SectionDivider label="专业技能" icon="🛠" enLabel="Skills" />

          <SkillProgressBar categories={skillLevelData} />
        </section>
      </div>
    </div>
  );
}

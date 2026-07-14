'use client';

import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, Mail, Database, Bot, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { CapabilityCard } from '@/components/home/CapabilityCard';
import { projects } from '@/data/projects';
import { skillLevelData } from '@/data/about';

const allSkills = skillLevelData.flatMap((cat) =>
  cat.skills.map((s) => s.name)
);
const featuredProjects = projects.slice(0, 2);

const CAPABILITIES = [
  {
    icon: Database,
    title: '数据工程能力',
    description:
      '覆盖数据采集、ETL清洗、可视化分析全链路，擅长海量数据处理与建模，具备从原始数据到商业洞察的完整工程能力。',
  },
  {
    icon: Bot,
    title: 'AI工程化开发',
    description:
      '熟练运用 Claude Code、Trae Work 等 AI Agent 工具，基于 Harness 工程思想高效交付项目，将 AI 真正融入开发工作流。',
  },
  {
    icon: Code2,
    title: '全栈项目落地',
    description:
      '具备前后端开发能力，可独立完成从需求分析、架构设计到部署上线的完整项目闭环，追求高质量的代码与用户体验。',
  },
];

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: 'easeOut' },
  },
};

export function HomeSections() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
      {/* ========== 精选项目 ========== */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
      >
        <SectionHeader enTitle="Featured Projects" zhTitle="精选项目" />

        <div className="grid gap-6 sm:grid-cols-2">
          {featuredProjects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            render={<Link href="/projects" />}
            variant="outline"
            size="lg"
          >
            <ArrowRight className="mr-2 size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            查看全部项目
          </Button>
        </div>
      </motion.section>

      {/* ========== 核心能力 ========== */}
      <motion.section
        className="mt-24 sm:mt-36"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
      >
        <SectionHeader enTitle="Core Capabilities" zhTitle="核心能力" />

        <div className="grid gap-6 sm:grid-cols-3">
          {CAPABILITIES.map((cap, i) => (
            <CapabilityCard
              key={cap.title}
              icon={cap.icon}
              title={cap.title}
              description={cap.description}
              index={i}
            />
          ))}
        </div>
      </motion.section>

      {/* ========== 关于我 ========== */}
      <motion.section
        className="mt-24 sm:mt-36"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
      >
        <SectionHeader enTitle="About Me" zhTitle="关于我" />

        <div className="mx-auto max-w-3xl text-center">
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            我是一名全栈开发者，热衷于大数据、人工智能以及构建有意义的工具。
            从实时数据管道到 AI 驱动的应用，我乐于将复杂问题转化为优雅的解决方案。
            HOU Universe 是我的数字乐园——一个展示项目、记录学习历程、
            分享我一路所建所感的地方。
          </p>

          {/* Skill tags */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {allSkills.slice(0, 12).map((skillName) => (
              <Badge
                key={skillName}
                variant="secondary"
                className="border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs transition-all duration-300 hover:border-slate-400/30 hover:bg-slate-400/6 hover:text-slate-200"
              >
                {skillName}
              </Badge>
            ))}
          </div>

          <div className="mt-10">
            <Button
              render={<Link href="/about" />}
              variant="outline"
              size="lg"
            >
              <ArrowRight className="mr-2 size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              了解更多关于我
            </Button>
          </div>
        </div>
      </motion.section>

      {/* ========== 联系我 ========== */}
      <motion.section
        className="mt-24 sm:mt-36"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
      >
        <SectionHeader enTitle="Get In Touch" zhTitle="联系我" />

        <div className="mx-auto max-w-2xl text-center">
          <h3 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            一起创造吧
          </h3>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            无论你有一个项目想法、合作机会，还是只想聊聊技术——
            我始终欢迎与其他构建者和创作者交流。
          </p>

          <div className="mt-10">
            <Button
              render={<Link href="/contact" />}
              variant="default"
              size="lg"
            >
              <Mail className="mr-2 size-4" />
              联系我
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

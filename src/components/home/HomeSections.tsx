'use client';

import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { projects } from '@/data/projects';
import { skillTreeData } from '@/data/about';
import type { SkillItem } from '@/types';

const allSkills: SkillItem[] = skillTreeData.flatMap((cat) => cat.skills);
const featuredProjects = projects.slice(0, 2);

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-10 flex items-center gap-3 sm:mb-14">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
      <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
        {label}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
    </div>
  );
}

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
        <SectionDivider label="精选项目" />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProjects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Button
            render={<Link href="/projects" />}
            variant="outline"
            size="lg"
          >
            <ArrowRight className="mr-2 size-4" />
            查看全部项目
          </Button>
        </div>
      </motion.section>

      {/* ========== 关于我 ========== */}
      <motion.section
        className="mt-24 sm:mt-32"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
      >
        <SectionDivider label="关于我" />

        <div className="mx-auto max-w-3xl text-center">
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            我是一名全栈开发者，热衷于大数据、人工智能以及构建有意义的工具。
            从实时数据管道到 AI 驱动的应用，我乐于将复杂问题转化为优雅的解决方案。
            HOU Universe 是我的数字乐园——一个展示项目、记录学习历程、
            分享我一路所建所感的地方。
          </p>

          {/* Skill tags */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {allSkills.slice(0, 12).map((skill) => (
              <Badge
                key={skill.name}
                variant="secondary"
                className="px-3 py-1 text-xs transition-all hover:border-blue-400/40 hover:bg-blue-400/8 hover:shadow-[0_0_12px_rgba(96,165,250,0.10)]"
              >
                {skill.name}
              </Badge>
            ))}
          </div>

          <div className="mt-10">
            <Button
              render={<Link href="/about" />}
              variant="outline"
              size="lg"
            >
              <ArrowRight className="mr-2 size-4" />
              了解更多关于我
            </Button>
          </div>
        </div>
      </motion.section>

      {/* ========== 联系我 ========== */}
      <motion.section
        className="mt-24 sm:mt-32"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
      >
        <SectionDivider label="联系我" />

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

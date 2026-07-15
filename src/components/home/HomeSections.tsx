'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
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

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: 'easeOut' },
  },
};

export function HomeSections() {
  const { t } = useTranslation();

  const CAPABILITIES = [
    {
      icon: Database,
      title: t('capabilities.data.title'),
      description: t('capabilities.data.description'),
    },
    {
      icon: Bot,
      title: t('capabilities.ai.title'),
      description: t('capabilities.ai.description'),
    },
    {
      icon: Code2,
      title: t('capabilities.fullstack.title'),
      description: t('capabilities.fullstack.description'),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
      {/* ========== 精选项目 ========== */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={sectionVariants}
      >
        <SectionHeader enTitle={t('home.featuredProjectsEn')} zhTitle={t('home.featuredProjects')} />

        <div className="grid gap-6 sm:grid-cols-2 card-grid-depth">
          {featuredProjects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            render={<Link href="/projects" />}
            variant="outline"
            size="xl"
          >
            <ArrowRight className="mr-2 size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            {t('home.viewAllProjects')}
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
        <SectionHeader enTitle={t('home.coreCapabilitiesEn')} zhTitle={t('home.coreCapabilities')} />

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
        <SectionHeader enTitle={t('home.aboutMeEn')} zhTitle={t('home.aboutMe')} />

        <div className="mx-auto max-w-3xl text-center">
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t('home.aboutParagraph')}
          </p>

          {/* Skill tags */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {allSkills.slice(0, 12).map((skillName) => (
              <Badge
                key={skillName}
                variant="secondary"
                className="border-slate-300/30 bg-slate-100/50 px-3 py-1 text-xs transition-all duration-300 hover:border-brand/20 hover:bg-brand/5 hover:text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-slate-400/30 dark:hover:bg-slate-400/6 dark:hover:text-slate-200"
              >
                {skillName}
              </Badge>
            ))}
          </div>

          <div className="mt-10">
            <Button
              render={<Link href="/about" />}
              variant="outline"
              size="xl"
            >
              <ArrowRight className="mr-2 size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              {t('home.learnMoreAboutMe')}
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
        <SectionHeader enTitle={t('home.getInTouchEn')} zhTitle={t('home.getInTouch')} />

        <div className="mx-auto max-w-2xl text-center">
          <h3 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('home.letsCreate')}
          </h3>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t('home.contactPrompt')}
          </p>

          <div className="mt-10">
            <Button
              render={<Link href="/contact" />}
              variant="default"
              size="xl"
            >
              <Mail className="mr-2 size-4" />
              {t('home.contactMe')}
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

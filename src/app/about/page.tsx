import type { Metadata } from 'next';
import { Timeline } from '@/components/about/Timeline';
import { SkillTree } from '@/components/about/SkillTree';
import { timelineData, skillTreeData } from '@/data/about';

export const metadata: Metadata = {
  title: 'About - HOU Universe',
  description: 'My growth trajectory and skill map — from first lines of code to a full-stack developer platform.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        {/* Page header */}
        <header className="mb-16 text-center sm:mb-24">
          <p className="mb-3 font-mono text-sm tracking-[0.25em] text-blue-300/60 uppercase">
            About
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            About
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            这里是「成长轨迹」与「技能地图」。每一条时间节点记录了我从零开始的技术积累，
            每一项技能标签映射出当下的能力版图。持续探索，持续构建。
          </p>
        </header>

        {/* Timeline section */}
        <section className="mb-20 sm:mb-32">
          <div className="mb-10 flex items-center gap-3 sm:mb-14">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
            <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
              成长轨迹
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
          </div>
          <Timeline items={timelineData} />
        </section>

        {/* Skills section */}
        <section>
          <div className="mb-10 flex items-center gap-3 sm:mb-14">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
            <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
              技能地图
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
          </div>
          <SkillTree categories={skillTreeData} />
        </section>
      </div>
    </div>
  );
}

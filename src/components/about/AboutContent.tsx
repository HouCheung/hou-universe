"use client";

import { useTranslation } from "react-i18next";
import { StarSkillTree } from "@/components/about/StarSkillTree";
import { GitHubContributions } from "@/components/about/GitHubContributions";
import { skillLevelData } from "@/data/about";

const courseKeys = Array.from({ length: 9 }, (_, i) => `about.courses.${i}`);
const projectKeys = ["p0", "p1", "p2", "p3", "p4"];
const aiSkillKeys = ["0", "1", "2"];

function SectionDivider({ titleKey, icon }: { titleKey: string; icon: string }) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const enTitle = isZh ? i18n.getFixedT("en")(titleKey) : undefined;

  return (
    <div className="mb-10 flex items-center gap-4 sm:mb-14">
      <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
      <div className="flex flex-col gap-0.5">
        {enTitle && (
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-slate-500/50 sm:text-[0.65rem] dark:text-slate-400/30">
            {enTitle}
          </span>
        )}
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          <span className="text-xl" role="img" aria-hidden="true">
            {icon}
          </span>
          {t(titleKey)}
        </h2>
      </div>
      <span className="ml-auto h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
    </div>
  );
}

export function AboutContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36 max-sm:px-5 max-sm:py-16">
        {/* Page header */}
        <header className="mb-16 text-center sm:mb-24 max-sm:mb-12">
          <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-500/80 uppercase dark:text-slate-400/60">
            {t("about.subhead")}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl max-sm:text-3xl">
            {t("about.heading")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg max-sm:text-sm max-sm:mt-4">
            {t("about.intro")}
          </p>
        </header>

        {/* ① Education */}
        <section className="mb-20 sm:mb-32 max-sm:mb-14">
          <SectionDivider titleKey="about.education" icon="🎓" />
          <div className="glass-card-hover rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-foreground">{t("about.school")}</h3>
                <p className="mt-1 text-base text-slate-700/90 dark:text-slate-300/80">{t("about.major")}</p>
              </div>
              <span className="inline-block shrink-0 rounded-full bg-slate-300/20 px-4 py-1.5 font-mono text-sm font-medium text-slate-600/90 sm:self-start dark:bg-slate-400/10 dark:text-slate-300/90">
                {t("about.period")}
              </span>
            </div>
            <div className="mt-6">
              <h4 className="mb-3 text-sm font-semibold text-foreground">{t("about.coursesTitle")}</h4>
              <div className="flex flex-wrap gap-2">
                {courseKeys.map((key, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-lg border border-border/50 bg-secondary/50 px-3 py-1.5 text-sm text-foreground transition-all duration-200 hover:border-brand/30 hover:bg-brand/6 hover:shadow-[0_0_12px_rgba(var(--brand-rgb),0.12)]"
                  >
                    {t(key)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ② Projects */}
        <section className="mb-20 sm:mb-32 max-sm:mb-14">
          <SectionDivider titleKey="about.projects" icon="💼" />
          <div className="relative">
            <div className="absolute left-[15px] top-0 h-full w-px bg-border sm:left-[19px]" />
            <div className="flex flex-col gap-8">
              {projectKeys.map((pk) => (
                <div key={pk} className="relative flex gap-5 pl-10 sm:gap-6 sm:pl-14">
                  <div className="absolute left-[11px] top-2 h-2.5 w-2.5 rounded-full border-2 border-brand/50 bg-background ring-4 ring-background sm:left-[15px]" />
                  <div className="glass-card-hover flex-1 rounded-2xl p-5 sm:p-6">
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="rounded-full bg-slate-300/20 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-600/90 dark:bg-slate-400/10 dark:text-slate-300/90">
                        {t(`aboutProjects.${pk}.period`)}
                      </span>
                      <span className="text-xs font-medium text-slate-500/60 dark:text-slate-300/60">
                        {t(`aboutProjects.${pk}.role`)}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {t(`aboutProjects.${pk}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {t(`aboutProjects.${pk}.desc`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ③ AI Engineering */}
        <section className="mb-20 sm:mb-32 max-sm:mb-14">
          <SectionDivider titleKey="about.aiEngineering" icon="🤖" />
          <div className="grid gap-4 sm:grid-cols-3">
            {aiSkillKeys.map((sk, index) => (
              <div key={index} className="glass-card-hover rounded-2xl p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-300/20 text-slate-500 dark:bg-slate-400/10 dark:text-slate-300">
                  <span className="text-lg font-bold" aria-hidden="true">
                    {index === 0 ? "🔧" : index === 1 ? "🧠" : "📐"}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`aiSkills.${sk}`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ④ Campus */}
        <section className="mb-20 sm:mb-32 max-sm:mb-14">
          <SectionDivider titleKey="about.campus" icon="🎭" />
          <div className="flex flex-col gap-6">
            <div className="glass-card-hover rounded-2xl p-6 sm:p-7">
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {t("campusActivities.ca1.title")}
                </h3>
                <span className="rounded-full bg-slate-300/20 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-600/90 dark:bg-slate-400/10 dark:text-slate-300/90">
                  {t("campusActivities.ca1.period")}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("campusActivities.ca1.desc")}
              </p>
            </div>
          </div>
        </section>

        {/* ⑤ Skills */}
        <section>
          <SectionDivider titleKey="about.skills" icon="🛠" />
          <StarSkillTree categories={skillLevelData} />
        </section>

        {/* ⑥ GitHub 开源贡献 */}
        <GitHubContributions />
      </div>
    </div>
  );
}

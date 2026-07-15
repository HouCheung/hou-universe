"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Github, ExternalLink } from "lucide-react";

interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface GitHubData {
  totalContributions: number;
  weeks: ContributionDay[][];
}

const GITHUB_USERNAME = "HouCheung";

function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 12) return 3;
  return 4;
}

const levelColors: Record<number, string> = {
  0: "bg-white/[0.03]",
  1: "bg-[#0e4429]",
  2: "bg-[#006d32]",
  3: "bg-[#26a641]",
  4: "bg-[#39d353]",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function GitHubContributions() {
  const { t } = useTranslation();
  const [data, setData] = useState<GitHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState(GITHUB_USERNAME);
  const [inputUsername, setInputUsername] = useState(GITHUB_USERNAME);
  const [error, setError] = useState<string | null>(null);

  const fetchContributions = useCallback(async (user: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `https://github-contributions-api.deno.dev/${user}.json`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch");
      }
      const json = await response.json();
      // Transform data
      const totalContributions: number = json.totalContributions ?? json.total?.contributions ?? 0;
      const weeks: ContributionDay[][] = [];
      if (json.contributions && Array.isArray(json.contributions)) {
        // Group by week
        for (let i = 0; i < json.contributions.length; i += 7) {
          const week: ContributionDay[] = [];
          for (let j = i; j < i + 7 && j < json.contributions.length; j++) {
            const day = json.contributions[j];
            week.push({
              date: day.date || day.startedAt || "",
              count: day.count ?? day.contributionCount ?? 0,
              level: getLevel(day.count ?? day.contributionCount ?? 0),
            });
          }
          if (week.length > 0) {
            weeks.push(week);
          }
        }
      }
      setData({ totalContributions, weeks });
    } catch {
      setError(t("githubContributions.error", "Failed to load contributions. Check the username or try again later."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchContributions(username);
  }, [username, fetchContributions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUsername(inputUsername.trim());
  };

  /* ── Get month labels from weeks data ── */
  const monthLabels = data?.weeks
    ? (() => {
        const labels: { label: string; index: number }[] = [];
        let currentMonth = -1;
        data.weeks.forEach((week, i) => {
          if (week.length > 0 && week[0].date) {
            const month = new Date(week[0].date).getMonth();
            if (month !== currentMonth) {
              currentMonth = month;
              labels.push({ label: MONTH_LABELS[month], index: i });
            }
          }
        });
        return labels;
      })()
    : [];

  return (
    <section className="mb-20 sm:mb-32">
      {/* Section header */}
      <div className="mb-10 flex items-center gap-4 sm:mb-14">
        <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-slate-500/50 sm:text-[0.65rem] dark:text-slate-400/30">
            {t("githubContributions.sectionEn", "Open Source")}
          </span>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            <Github className="h-5 w-5 text-slate-500 dark:text-slate-500 dark:text-slate-400" />
            {t("githubContributions.sectionTitle", "GitHub 开源贡献")}
          </h2>
        </div>
        <span className="ml-auto h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
      </div>

      <div className="glass-card-hover rounded-2xl p-6 sm:p-8">
        {/* Username input */}
        <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="github-username"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              {t("githubContributions.usernameLabel", "GitHub 用户名")}
            </label>
            <input
              id="github-username"
              type="text"
              value={inputUsername}
              onChange={(e) => setInputUsername(e.target.value)}
              className="glass-input w-full rounded-lg px-4 py-2.5 font-mono text-sm text-foreground outline-none"
              placeholder="e.g. HouCheung"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-brand/25 bg-brand/10 px-5 py-2.5 text-sm font-medium text-slate-800 transition-all dark:text-slate-200 duration-300 hover:border-brand/40 hover:bg-brand/20"
          >
            {t("githubContributions.load", "加载贡献")}
          </button>
          <a
            href={`https://github.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm text-slate-600 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            GitHub
          </a>
        </form>

        {/* Contribution grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3b82f6]/30 border-t-[#3b82f6]" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-500">{error}</div>
        ) : data ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {/* Total count */}
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {t("githubContributions.total", "过去一年贡献")}:
              </span>
              <span className="font-mono text-lg font-bold text-[#39d353]">
                {data.totalContributions.toLocaleString()}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-500">contributions</span>
            </div>

            {/* Heatmap */}
            <div className="overflow-x-auto">
              <div className="flex gap-[3px] min-w-max">
                {/* Day labels */}
                <div className="mr-2 flex flex-col gap-[3px] pt-[18px]">
                  {["", t("githubContributions.mon", "一"), "", t("githubContributions.wed", "三"), "", t("githubContributions.fri", "五"), ""].map(
                    (label, i) => (
                      <div
                        key={i}
                        className="flex h-[11px] items-center text-[0.55rem] text-slate-500 dark:text-slate-600"
                      >
                        {label}
                      </div>
                    )
                  )}
                </div>

                <div>
                  {/* Month labels */}
                  <div className="mb-1 flex text-[0.6rem] text-slate-600 h-[18px] dark:text-slate-600 dark:text-slate-500">
                    {monthLabels.map((ml, i) => (
                      <div
                        key={i}
                        className="absolute"
                        style={{ marginLeft: `${ml.index * 14}px` }}
                      >
                        {ml.label}
                      </div>
                    ))}
                    {/* Use relative positioning simpler approach */}
                  </div>
                  {/* Simplified: month labels inline */}
                  <div className="mb-1 flex gap-[3px] text-[0.6rem] text-slate-600 dark:text-slate-500">
                    {(() => {
                      const labels: string[] = [];
                      let lastMonth = -1;
                      data.weeks.forEach((week) => {
                        if (week.length > 0 && week[0].date) {
                          const m = new Date(week[0].date).getMonth();
                          if (m !== lastMonth) {
                            lastMonth = m;
                            labels.push(MONTH_LABELS[m]);
                          } else {
                            labels.push("");
                          }
                        } else {
                          labels.push("");
                        }
                      });
                      return labels.map((l, i) => (
                        <div key={i} className="w-[11px] text-center leading-[18px]">
                          {l}
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Contribution cells */}
                  <div className="flex gap-[3px]">
                    {data.weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((day, di) => (
                          <div
                            key={di}
                            className={`h-[11px] w-[11px] rounded-[2px] ${levelColors[day.level]}`}
                            title={`${day.date}: ${day.count} contributions`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-end gap-1.5 text-[0.6rem] text-slate-600 dark:text-slate-500">
              <span>{t("githubContributions.less", "Less")}</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`h-[10px] w-[10px] rounded-[2px] ${levelColors[level]}`}
                />
              ))}
              <span>{t("githubContributions.more", "More")}</span>
            </div>
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}

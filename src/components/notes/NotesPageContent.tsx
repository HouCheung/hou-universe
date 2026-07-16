"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Filter, X } from "lucide-react";
import { StarField } from "@/components/shared/StarField";
import { NoteCard } from "@/components/notes/NoteCard";
import type { Note } from "@/types";

interface NotesPageContentProps {
  notes: Note[];
  allCategories: string[];
}

export function NotesPageContent({ notes, allCategories }: NotesPageContentProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const filteredNotes = useMemo(() => {
    let result = notes;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.summary.toLowerCase().includes(query) ||
          note.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          note.categories.some((cat) => cat.toLowerCase().includes(query))
      );
    }

    // Filter by category
    if (selectedCategory) {
      result = result.filter((note) =>
        note.categories.includes(selectedCategory)
      );
    }

    return result;
  }, [notes, searchQuery, selectedCategory]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
  };

  const hasActiveFilters = searchQuery.trim() !== "" || selectedCategory !== "";

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36 max-sm:px-5 max-sm:py-16">
          {/* Page header */}
          <header className="mb-12 text-center sm:mb-16 max-sm:mb-10">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-500/80 uppercase dark:text-slate-500/70 dark:text-slate-400/60">
              {t("notes.subhead")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl max-sm:text-3xl">
              {t("notes.heading")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg max-sm:text-sm max-sm:mt-4">
              {t("notes.intro")}
            </p>
          </header>

          {/* Search + Filter bar */}
          <div className="mb-8 space-y-4 sm:mb-10 max-sm:mb-6 max-sm:space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500/70 dark:text-slate-400/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("notes.searchPlaceholder")}
                className="w-full rounded-xl border border-slate-300/30 bg-white/60 py-3 pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-sm transition-all duration-200 focus:border-brand/30 focus:bg-white/80 focus:outline-none focus:ring-1 focus:ring-brand/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:focus:bg-white/[0.05]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                  aria-label={t("notes.clearSearch")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Category filter chips */}
            {allCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-3.5 w-3.5 shrink-0 text-slate-500/60 dark:text-slate-400/50" />
                <button
                  onClick={() => setSelectedCategory("")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ${
                    selectedCategory === ""
                      ? "bg-brand/15 text-brand-light border border-brand/30"
                      : "border border-slate-300/30 text-muted-foreground hover:border-slate-400/40 hover:text-foreground/80 dark:border-white/[0.06] dark:hover:border-white/[0.12]"
                  }`}
                >
                  {t("notes.categoryAll")}
                </button>
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setSelectedCategory(
                        selectedCategory === cat ? "" : cat
                      )
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ${
                      selectedCategory === cat
                        ? "bg-brand/15 text-brand-light border border-brand/30"
                        : "border border-slate-300/30 text-muted-foreground hover:border-slate-400/40 hover:text-foreground/80 dark:border-white/[0.06] dark:hover:border-white/[0.12]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                    {t("notes.clearFilters")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Notes grid */}
          {filteredNotes.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {filteredNotes.map((note, index) => (
                <NoteCard key={note.slug} note={note} index={index} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg text-muted-foreground">
                {hasActiveFilters ? t("notes.noResults") : t("notes.empty")}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-3 text-sm text-brand transition-colors hover:text-brand-deep dark:text-brand-light/80 dark:hover:text-brand-light"
                >
                  {t("notes.clearFilters")}
                </button>
              )}
            </div>
          )}

          {/* Post count */}
          <p className="mt-10 text-center text-xs text-muted-foreground/50">
            {filteredNotes.length === notes.length
              ? t("notes.totalPosts", { count: notes.length })
              : t("notes.filteredPosts", {
                  filtered: filteredNotes.length,
                  total: notes.length,
                })}
          </p>
        </div>
      </div>
    </>
  );
}

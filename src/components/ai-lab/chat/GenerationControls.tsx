"use client";

// ============================================================
// GenerationControls — Parameter control bar
// ============================================================
// Phase 69: Compact, collapsible controls for generation
// parameters. Displays model, checkpoint, temperature preset,
// and advanced params toggle below the chat composer.
// ============================================================

import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Database,
  Loader2,
  Settings2,
  Upload,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

export type TemperaturePreset = "precise" | "balanced" | "creative";

export type CheckpointImportState = "idle" | "validating" | "success" | "error";

export interface GenerationParams {
  temperature: number;
  maxTokens: number;
  topK: number;
  topP: number;
  /** Sampler seed — explicit and visible; 42 is the deterministic default. */
  seed: number;
}

export interface GenerationControlsProps {
  modelName: string;
  checkpointName: string;
  isBaseline: boolean;
  params: GenerationParams;
  preset: TemperaturePreset;
  onPresetChange: (preset: TemperaturePreset) => void;
  onParamsChange: (params: Partial<GenerationParams>) => void;
  onImportCheckpoint: (fileName: string, json: string) => Promise<void>;
  importState: CheckpointImportState;
  importMessage: string | null;
  disabled: boolean;
}

// ============================================================
// Preset config
// ============================================================

const PRESETS: Record<
  TemperaturePreset,
  { temperature: number; topK: number; labelKey: string }
> = {
  precise: { temperature: 0.2, topK: 20, labelKey: "aiLab.chat.controls.precise" },
  balanced: { temperature: 0.8, topK: 40, labelKey: "aiLab.chat.controls.balanced" },
  creative: { temperature: 1.2, topK: 80, labelKey: "aiLab.chat.controls.creative" },
};

// ============================================================
// GenerationControls
// ============================================================

export function GenerationControls({
  modelName,
  checkpointName,
  isBaseline,
  params,
  preset,
  onPresetChange,
  onParamsChange,
  onImportCheckpoint,
  importState,
  importMessage,
  disabled,
}: GenerationControlsProps) {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePresetChange = (newPreset: TemperaturePreset) => {
    onPresetChange(newPreset);
    const config = PRESETS[newPreset];
    onParamsChange({
      temperature: config.temperature,
      topK: config.topK,
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-importing the same filename later.
    event.target.value = "";
    if (!file) return;

    setReading(true);
    try {
      const json = await file.text();
      await onImportCheckpoint(file.name, json);
    } finally {
      setReading(false);
    }
  };

  const importBusy = reading || importState === "validating";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-brand/[0.04] pt-3 dark:border-white/[0.03]">
        {/* Model indicator */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-brand/[0.06] bg-brand/[0.015] px-2.5 py-1 dark:border-white/[0.04] dark:bg-white/[0.01]">
          <Cpu className="size-3 text-brand/40" />
          <span className="font-mono text-[0.6rem] tracking-wide text-slate-500/70 dark:text-slate-400/50">
            {modelName}
          </span>
        </div>

        {/* Checkpoint indicator + baseline/trained status */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-brand/[0.06] bg-brand/[0.015] px-2.5 py-1 dark:border-white/[0.04] dark:bg-white/[0.01]">
          <Database className="size-3 text-brand/40" />
          <span className="font-mono text-[0.6rem] tracking-wide text-slate-500/70 dark:text-slate-400/50">
            {checkpointName}
          </span>
          <span
            className={`font-mono text-[0.55rem] uppercase tracking-wider ${
              isBaseline
                ? "text-amber-500/70 dark:text-amber-400/60"
                : "text-emerald-500/70 dark:text-emerald-400/60"
            }`}
          >
            {isBaseline
              ? t("aiLab.chat.controls.baselineStatus")
              : t("aiLab.chat.controls.trainedStatus")}
          </span>
        </div>

        {/* Seed indicator */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-brand/[0.06] bg-brand/[0.015] px-2.5 py-1 dark:border-white/[0.04] dark:bg-white/[0.01]">
          <span className="font-mono text-[0.6rem] tracking-wide text-slate-500/70 dark:text-slate-400/50">
            {t("aiLab.chat.controls.seed")} {params.seed}
          </span>
        </div>

        {/* Checkpoint import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          disabled={disabled || importBusy}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[0.6rem] tracking-wide text-slate-500/50 transition-all duration-200 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400/30 dark:hover:text-slate-300"
        >
          {importBusy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          {t("aiLab.chat.controls.importCheckpoint")}
        </button>

        {/* Separator */}
        <span
          aria-hidden="true"
          className="h-4 w-px bg-brand/[0.06] dark:bg-white/[0.04]"
        />

        {/* Temperature presets */}
        <div className="inline-flex items-center rounded-full border border-brand/[0.06] bg-brand/[0.015] p-0.5 dark:border-white/[0.04] dark:bg-white/[0.01]">
          {(Object.entries(PRESETS) as [TemperaturePreset, typeof PRESETS["balanced"]][]).map(
            ([key, config]) => (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => handlePresetChange(key)}
                className={`rounded-full px-2.5 py-1 font-mono text-[0.6rem] tracking-wide transition-all duration-200 ${
                  preset === key
                    ? "bg-brand/[0.1] text-brand dark:bg-brand/[0.15] dark:text-brand-light"
                    : "text-slate-500/60 hover:text-slate-700 dark:text-slate-400/40 dark:hover:text-slate-300"
                }`}
              >
                {t(config.labelKey)}
              </button>
            )
          )}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[0.6rem] tracking-wide transition-all duration-200 ${
            showAdvanced
              ? "text-brand"
              : "text-slate-500/50 hover:text-slate-700 dark:text-slate-400/30 dark:hover:text-slate-300"
          }`}
        >
          <Settings2 className="size-3" />
          {t("aiLab.chat.controls.advanced")}
          <ChevronDown
            className={`size-3 transition-transform duration-200 ${
              showAdvanced ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Checkpoint import status */}
      {importMessage && (
        <div
          role="status"
          className={`mt-2 flex items-center justify-center gap-1.5 text-[0.65rem] ${
            importState === "error"
              ? "text-rose-500/80 dark:text-rose-400/70"
              : importState === "success"
                ? "text-emerald-500/80 dark:text-emerald-400/70"
                : "text-slate-500/70 dark:text-slate-400/50"
          }`}
        >
          {importState === "error" ? (
            <AlertTriangle className="size-3 shrink-0" />
          ) : importState === "success" ? (
            <CheckCircle2 className="size-3 shrink-0" />
          ) : (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          )}
          <span className="text-center">{importMessage}</span>
        </div>
      )}

      {/* Advanced panel */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mx-auto mt-3 grid max-w-xl grid-cols-2 gap-3 rounded-2xl border border-brand/[0.06] bg-brand/[0.015] px-4 py-4 sm:grid-cols-5 dark:border-white/[0.04] dark:bg-white/[0.01]">
              {/* Temperature */}
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[0.6rem] tracking-wide text-slate-500/60 dark:text-slate-400/40">
                  {t("aiLab.chat.controls.temperature")}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={params.temperature}
                  onChange={(e) =>
                    onParamsChange({ temperature: parseFloat(e.target.value) })
                  }
                  disabled={disabled}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand/[0.08] accent-brand dark:bg-white/[0.06]"
                />
                <span className="text-center font-mono text-[0.6rem] tabular-nums text-foreground/70">
                  {params.temperature.toFixed(1)}
                </span>
              </div>

              {/* Max Tokens */}
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[0.6rem] tracking-wide text-slate-500/60 dark:text-slate-400/40">
                  {t("aiLab.chat.controls.maxTokens")}
                </label>
                <input
                  type="range"
                  min="8"
                  max="256"
                  step="8"
                  value={params.maxTokens}
                  onChange={(e) =>
                    onParamsChange({ maxTokens: parseInt(e.target.value) })
                  }
                  disabled={disabled}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand/[0.08] accent-brand dark:bg-white/[0.06]"
                />
                <span className="text-center font-mono text-[0.6rem] tabular-nums text-foreground/70">
                  {params.maxTokens}
                </span>
              </div>

              {/* Top-K */}
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[0.6rem] tracking-wide text-slate-500/60 dark:text-slate-400/40">
                  {t("aiLab.chat.controls.topK")}
                </label>
                <input
                  type="range"
                  min="1"
                  max="200"
                  step="1"
                  value={params.topK}
                  onChange={(e) =>
                    onParamsChange({ topK: parseInt(e.target.value) })
                  }
                  disabled={disabled}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand/[0.08] accent-brand dark:bg-white/[0.06]"
                />
                <span className="text-center font-mono text-[0.6rem] tabular-nums text-foreground/70">
                  {params.topK}
                </span>
              </div>

              {/* Top-P */}
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[0.6rem] tracking-wide text-slate-500/60 dark:text-slate-400/40">
                  {t("aiLab.chat.controls.topP")}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={params.topP}
                  onChange={(e) =>
                    onParamsChange({ topP: parseFloat(e.target.value) })
                  }
                  disabled={disabled}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand/[0.08] accent-brand dark:bg-white/[0.06]"
                />
                <span className="text-center font-mono text-[0.6rem] tabular-nums text-foreground/70">
                  {params.topP.toFixed(2)}
                </span>
              </div>

              {/* Seed */}
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[0.6rem] tracking-wide text-slate-500/60 dark:text-slate-400/40">
                  {t("aiLab.chat.controls.seed")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={params.seed}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (!Number.isNaN(parsed)) onParamsChange({ seed: parsed });
                  }}
                  disabled={disabled}
                  className="rounded-lg border border-brand/[0.08] bg-transparent px-2 py-1 text-center font-mono text-[0.7rem] tabular-nums text-foreground/70 outline-none focus:border-brand/40 disabled:opacity-50 dark:border-white/[0.06]"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

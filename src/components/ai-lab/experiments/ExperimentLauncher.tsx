"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import {
  FlaskConical,
  Rocket,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  Cpu,
  BookOpen,
  Database,
  Hash,
  Clock,
  Zap,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getAvailableModels,
  getAvailableRecipes,
  getDatasetOptions,
  buildExperimentPreview,
  validateLaunchConfig,
  suggestExperimentName,
  type LaunchConfig,
  type ExperimentPreview,
  type LaunchValidationResult,
} from "@/lib/ai-lab/adapters/experimentLauncherAdapter";

// ============================================================
// Animation variants
// ============================================================

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// ============================================================
// ExperimentLauncher
// ============================================================

interface ExperimentLauncherProps {
  /** Callback fired when the user launches an experiment */
  onLaunch: (config: LaunchConfig) => void;
  /** Whether a launch is currently in progress */
  isLaunching?: boolean;
}

/**
 * ExperimentLauncher — interactive form for configuring and
 * launching MiniMind training experiments.
 *
 * Features:
 *   - Model selector (from ModelRegistry)
 *   - Recipe selector (from TrainingRecipe)
 *   - Dataset selector
 *   - Seed input with randomize button
 *   - Live experiment preview
 *   - Validation with errors and warnings
 *   - Launch button (disabled until valid)
 */
export function ExperimentLauncher({
  onLaunch,
  isLaunching = false,
}: ExperimentLauncherProps) {
  // ── State ──
  const [model, setModel] = useState<string>("production");
  const [recipe, setRecipe] = useState<string>("bilingual-foundation");
  const [dataset, setDataset] = useState<string>("bilingual");
  const [seed, setSeed] = useState<number>(42);
  const [experimentName, setExperimentName] = useState<string>("");
  const [blockSize, setBlockSize] = useState<string>("");
  const [batchSize, setBatchSize] = useState<string>("");
  const [epochs, setEpochs] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Derived data ──
  const models = useMemo(() => getAvailableModels(), []);
  const allRecipes = useMemo(() => getAvailableRecipes(), []);
  const datasets = useMemo(() => getDatasetOptions(), []);

  // Filter recipes by selected model
  const recipes = useMemo(
    () => allRecipes.filter((r) => r.model === model),
    [allRecipes, model]
  );

  // Auto-select first recipe when model changes
  const effectiveRecipe = useMemo(() => {
    if (recipes.some((r) => r.value === recipe)) return recipe;
    return recipes[0]?.value ?? recipe;
  }, [recipes, recipe]);

  // ── Launch config ──
  const launchConfig: LaunchConfig = useMemo(
    () => ({
      model,
      recipe: effectiveRecipe,
      dataset,
      seed,
      experimentName:
        experimentName.trim() ||
        suggestExperimentName({ model, recipe: effectiveRecipe, dataset, seed, experimentName: "" }),
    }),
    [model, effectiveRecipe, dataset, seed, experimentName]
  );

  // ── Preview ──
  const preview: ExperimentPreview | null = useMemo(() => {
    try {
      return buildExperimentPreview({
        ...launchConfig,
        blockSize: blockSize ? parseInt(blockSize, 10) : undefined,
        batchSize: batchSize ? parseInt(batchSize, 10) : undefined,
        epochs: epochs ? parseInt(epochs, 10) : undefined,
      });
    } catch {
      return null;
    }
  }, [launchConfig, blockSize, batchSize, epochs]);

  // ── Validation ──
  const validation: LaunchValidationResult = useMemo(
    () =>
      validateLaunchConfig({
        ...launchConfig,
        blockSize: blockSize ? parseInt(blockSize, 10) : undefined,
        batchSize: batchSize ? parseInt(batchSize, 10) : undefined,
        epochs: epochs ? parseInt(epochs, 10) : undefined,
      }),
    [launchConfig, blockSize, batchSize, epochs]
  );

  // ── Handlers ──
  const handleRandomizeSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 100000));
  }, []);

  const handleLaunch = useCallback(() => {
    if (!validation.valid || isLaunching) return;
    onLaunch({
      ...launchConfig,
      experimentName:
        experimentName.trim() ||
        suggestExperimentName(launchConfig),
      blockSize: blockSize ? parseInt(blockSize, 10) : undefined,
      batchSize: batchSize ? parseInt(batchSize, 10) : undefined,
      epochs: epochs ? parseInt(epochs, 10) : undefined,
    });
  }, [validation.valid, isLaunching, launchConfig, experimentName, blockSize, batchSize, epochs, onLaunch]);

  const handleModelChange = useCallback(
    (value: string) => {
      setModel(value);
      // Auto-switch recipe to first compatible one
      const modelRecipes = allRecipes.filter((r) => r.model === value);
      if (modelRecipes.length > 0 && modelRecipes[0]) {
        setRecipe(modelRecipes[0].value);
      }
    },
    [allRecipes]
  );

  const selectedModel = models.find((m) => m.value === model);
  const selectedDataset = datasets.find((d) => d.value === dataset);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      {/* ── Section header ── */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10 dark:bg-brand/20">
          <FlaskConical className="size-5 text-brand" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Launch Training Experiment
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure and start a MiniMind training run
          </p>
        </div>
      </motion.div>

      {/* ── Main form grid ── */}
      <motion.div
        variants={itemVariants}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {/* Model selector */}
        <SelectField
          label="Model"
          icon={<Cpu className="size-3.5" />}
          value={model}
          onChange={handleModelChange}
          options={models}
        />

        {/* Recipe selector */}
        <SelectField
          label="Recipe"
          icon={<BookOpen className="size-3.5" />}
          value={effectiveRecipe}
          onChange={setRecipe}
          options={recipes}
          placeholder="Select a recipe..."
        />

        {/* Dataset selector */}
        <SelectField
          label="Dataset"
          icon={<Database className="size-3.5" />}
          value={dataset}
          onChange={setDataset}
          options={datasets}
        />
      </motion.div>

      {/* ── Dataset provenance (Phase 82) ── */}
      {selectedDataset && (
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
        >
          <Database className="size-3.5" />
          <span className="font-medium">{selectedDataset.languageCoverage}</span>
          <span aria-hidden>·</span>
          <span>v{selectedDataset.version}</span>
          <span aria-hidden>·</span>
          <span>{selectedDataset.sampleCount} samples</span>
          <Badge
            variant={selectedDataset.isFixture ? "secondary" : "default"}
            className="text-[10px]"
          >
            {selectedDataset.isFixture ? "Fixture" : "Production"}
          </Badge>
        </motion.div>
      )}

      {/* ── Second row: seed + name ── */}
      <motion.div
        variants={itemVariants}
        className="grid gap-4 sm:grid-cols-2"
      >
        {/* Seed input */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Hash className="size-3.5" />
            Seed
          </label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={seed}
              onChange={(e) =>
                setSeed(parseInt(e.target.value, 10) || 0)
              }
              className="flex-1 font-mono text-sm"
              min={0}
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleRandomizeSeed}
              className="shrink-0 text-xs"
            >
              Random
            </Button>
          </div>
        </div>

        {/* Experiment name */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <FlaskConical className="size-3.5" />
            Experiment Name
          </label>
          <Input
            type="text"
            value={experimentName}
            onChange={(e) => setExperimentName(e.target.value)}
            placeholder={suggestExperimentName(launchConfig)}
            className="font-mono text-sm"
          />
        </div>
      </motion.div>

      {/* ── Advanced options toggle ── */}
      <motion.div variants={itemVariants}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${
              showAdvanced ? "rotate-0" : "-rotate-90"
            }`}
          />
          Advanced Options
        </button>

        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-3 grid gap-4 overflow-hidden sm:grid-cols-3"
          >
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Layers className="size-3.5" />
                Block Size
              </label>
              <Input
                type="number"
                value={blockSize}
                onChange={(e) => setBlockSize(e.target.value)}
                placeholder="Recipe default"
                className="font-mono text-sm"
                min={2}
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Layers className="size-3.5" />
                Batch Size
              </label>
              <Input
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder="Recipe default"
                className="font-mono text-sm"
                min={1}
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Clock className="size-3.5" />
                Epochs
              </label>
              <Input
                type="number"
                value={epochs}
                onChange={(e) => setEpochs(e.target.value)}
                placeholder="Recipe default"
                className="font-mono text-sm"
                min={1}
              />
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* ── Model info card ── */}
      {selectedModel && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-brand/10 bg-brand/[0.02] p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]"
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-foreground">
              {selectedModel.label}
            </span>
            <Badge variant="default" className="text-xs">
              {selectedModel.estimatedParams.toLocaleString()} params
            </Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {selectedModel.architecture}
            </span>
          </div>
        </motion.div>
      )}

      {/* ── Preview panel ── */}
      {preview && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-slate-200/60 bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
        >
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Info className="size-4 text-brand" />
            Training Configuration Preview
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {preview.summary.map((line, i) => (
              <p
                key={i}
                className="text-xs text-slate-600 dark:text-slate-400"
              >
                {line}
              </p>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Validation messages ── */}
      {validation.errors.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-red-200/60 bg-red-50/60 p-4 backdrop-blur-sm dark:border-red-500/[0.15] dark:bg-red-500/[0.04]"
        >
          {validation.errors.map((err, i) => (
            <p
              key={i}
              className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400"
            >
              <AlertTriangle className="size-3.5 shrink-0" />
              {err}
            </p>
          ))}
        </motion.div>
      )}

      {validation.warnings.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4 backdrop-blur-sm dark:border-amber-500/[0.15] dark:bg-amber-500/[0.04]"
        >
          {validation.warnings.map((warn, i) => (
            <p
              key={i}
              className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400"
            >
              <Info className="size-3.5 shrink-0" />
              {warn}
            </p>
          ))}
        </motion.div>
      )}

      {/* ── Launch button ── */}
      <motion.div variants={itemVariants} className="flex items-center gap-4">
        <Button
          onClick={handleLaunch}
          disabled={!validation.valid || isLaunching}
          className="gap-2"
        >
          {isLaunching ? (
            <>
              <Zap className="size-4 animate-pulse" />
              Launching...
            </>
          ) : (
            <>
              <Rocket className="size-4" />
              Launch Experiment
            </>
          )}
        </Button>
        {validation.valid && !isLaunching && (
          <CheckCircle2 className="size-5 text-emerald-500" />
        )}
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// Internal: SelectField
// ============================================================

interface SelectFieldProps<T extends { value: string; label: string; description?: string }> {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: T[];
  placeholder?: string;
}

function SelectField<T extends { value: string; label: string; description?: string }>({
  label,
  icon,
  value,
  onChange,
  options,
  placeholder = "Select...",
}: SelectFieldProps<T>) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-slate-300/40 bg-white/60 px-3 pr-8 text-sm text-slate-700/80 backdrop-blur-sm transition-all duration-200 outline-none hover:border-slate-400/50 focus:border-blue-400/40 focus:bg-white/80 focus:ring-3 focus:ring-blue-400/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/60 dark:hover:border-white/[0.12] dark:focus:bg-white/[0.05]"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} title={opt.description}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}

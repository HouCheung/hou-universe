// ============================================================
// MiniMind CLI — minimind-cli.ts
// ============================================================
// Command-line interface for MiniMind training and inference.
//
// Commands:
//   train     — Train a model from a reproducible JSON config
//   evaluate  — Evaluate a trained model on a dataset
//   generate  — Generate text from a trained model
//
// Usage:
//   npx tsx src/lib/minimind/cli/minimind-cli.ts train --config config.json
//   npx tsx src/lib/minimind/cli/minimind-cli.ts evaluate --model ckpt.json
//   npx tsx src/lib/minimind/cli/minimind-cli.ts generate --model ckpt.json --prompt "Once"
//
// Design:
//   - Zero external dependencies (no commander/yargs)
//   - Reproducible via JSON config files
//   - Uses existing Tensor training backend
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { TrainingConfig } from "./TrainingConfig";
import type { TrainingConfigFile } from "./TrainingConfig";
import { BPETokenizer } from "../tokenizer/BPETokenizer";
import { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import { TextDataset } from "../data/TextDataset";
import { TinyStoriesDataset } from "../data/TinyStoriesDataset";
import { DataLoader } from "../data/DataLoader";
import { Trainer } from "../training/Trainer";
import type { TrainerConfig } from "../training/TrainerConfig";
import { AdamWOptimizer } from "../core/optim/AdamW";
import { CosineScheduler } from "../core/scheduler/CosineScheduler";
import { Tensor } from "../core/Tensor";
import { crossEntropyLoss } from "../core/loss/CrossEntropyLoss";
import {
  saveCheckpoint,
  loadCheckpoint,
} from "../training/checkpoint";
import { TrainingMetricsCollector } from "../training/Metrics";
import { TrainingState } from "../training/TrainingState";
import { TrainingLogger } from "../training/TrainingLogger";
import { ThroughputMeter } from "../training/ThroughputMeter";
import { TrainingMonitor } from "../training/TrainingMonitor";
import { computeGlobalNorm } from "../core/GradientClipper";
import type { ITokenizer } from "../data/ITokenizer";
import { TensorGenerator } from "../inference/TensorGenerator";
import { GenerationEvaluator } from "../evaluation/GenerationEvaluator";
import { ExperimentConfig } from "../experiments/ExperimentConfig";
import { runExperimentFromConfigFile } from "../experiments/TrainingExperimentRunner";
import { TrainingReport } from "../evaluation/TrainingReport";
import {
  ResearchBenchmarkRunner,
  BenchmarkSuite,
  createModelScaleSuite,
  createLearningRateSuite,
  createBenchmarkResearchReport,
  reportToJSON,
  reportToMarkdown,
  createExperimentFingerprint,
  extractExperimentIdentity,
  formatFingerprint,
  compareExperimentIdentity,
} from "../research/benchmark";
import { getModelConfig, listModels } from "../experiments/ModelRegistry";
import { loadRecipe, listRecipes } from "../experiments/TrainingRecipe";
import type { ResearchBenchmarkProfile } from "../research/benchmark";

// ============================================================
// Argument Parser (zero-dependency)
// ============================================================

interface ParsedArgs {
  command: string;
  options: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: Record<string, string> = {};
  let command = "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = "true";
      }
    } else if (!command) {
      command = arg;
    } else if (command === "research" && !options["_sub"]) {
      // First positional after "research" is the sub-command
      options["_sub"] = arg;
    }
  }

  return { command, options };
}

// ============================================================
// CLI Application
// ============================================================

class MiniMindCLI {
  private args: ParsedArgs;

  constructor(argv: string[]) {
    this.args = parseArgs(argv);
  }

  async run(): Promise<void> {
    switch (this.args.command) {
      case "train":
        await this.train();
        break;
      case "train-experiment":
        await this.trainExperiment();
        break;
      case "evaluate":
        await this.evaluate();
        break;
      case "generate":
        await this.generate();
        break;
      case "research":
        await this.research();
        break;
      default:
        this.printUsage();
        break;
    }
  }

  // ============================================================
  // Train Command
  // ============================================================

  private async train(): Promise<void> {
    const configPath = this.args.options["config"];
    if (!configPath) {
      console.error("Error: --config <path> is required for train command");
      process.exit(1);
    }

    // ── Parse new Phase 44 flags ──
    const logDir = this.args.options["log-dir"] ?? "";
    const enableMonitor = this.args.options["monitor"] === "true";
    const saveEvery = parseInt(this.args.options["save-every"] ?? "0", 10);
    const evalGenerate = this.args.options["eval-generate"] === "true";

    console.log(`Loading config from: ${configPath}`);
    const config = TrainingConfig.fromFile(configPath);
    const cfg = config.data;

    this.printHeader(`MiniMind Training: ${cfg.metadata.name}`);
    console.log(`Model preset: ${cfg.model.preset}`);
    console.log(`Seed: ${cfg.metadata.seed}`);
    console.log(`Epochs: ${cfg.training.epochs}, Batch: ${cfg.training.batchSize}`);
    console.log(`LR: ${cfg.training.learningRate}, WD: ${cfg.training.weightDecay}`);
    if (enableMonitor) console.log(`Monitor: enabled`);
    if (saveEvery > 0) console.log(`Checkpoint: every ${saveEvery} steps`);
    console.log(`${"=".repeat(60)}\n`);

    // Step 1: Tokenizer
    console.log("[1/6] Preparing tokenizer...");
    const tokenizer = await this.prepareTokenizer(cfg);

    // Step 2: Dataset + DataLoader
    console.log("[2/6] Loading dataset...");
    const corpus = await this.loadRawCorpus(cfg);
    const textDataset = new TextDataset({
      tokenizer: tokenizer as ITokenizer,
      corpus,
      blockSize: cfg.dataset.blockSize,
    });
    console.log(`  Samples: ${textDataset.length()}`);

    const trainLoader = new DataLoader(textDataset, {
      batchSize: cfg.training.batchSize,
      shuffle: true,
      seed: cfg.metadata.seed,
      dropLast: true,
    });
    console.log(`  Batches per epoch: ${trainLoader.numBatches}`);

    // Step 3: Model
    console.log("[3/6] Creating model...");
    const dims = config.getModelDimensions();
    console.log(`  dModel=${dims.dModel}, heads=${dims.numHeads}, ` +
      `dFF=${dims.dFF}, layers=${dims.numLayers}, vocab=${dims.vocabSize}`);
    const model = new TensorMiniMindModel({
      vocabSize: dims.vocabSize,
      dModel: dims.dModel,
      numHeads: dims.numHeads,
      dFF: dims.dFF,
      numLayers: dims.numLayers,
      maxSeqLen: dims.maxSeqLen,
    });
    console.log(`  Parameters: ${model.totalParamCount.toLocaleString()}`);

    // Step 4: Optimizer + Scheduler
    console.log("[4/6] Setting up optimizer...");
    const optimizer = new AdamWOptimizer(model.parameters(), {
      lr: cfg.training.learningRate,
      weightDecay: cfg.training.weightDecay,
    });

    const totalSteps = cfg.training.epochs * trainLoader.numBatches;
    const scheduler = new CosineScheduler(optimizer, {
      baseLR: cfg.training.learningRate,
      minLR: cfg.training.learningRate * 0.01,
      warmupSteps: cfg.training.warmupSteps,
      totalSteps,
    });

    const metrics = new TrainingMetricsCollector();
    const state = new TrainingState();

    // Output directory
    const runDir = path.join(cfg.output.dir, cfg.metadata.name.replace(/\s+/g, "-"));
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }
    config.save(path.join(runDir, "config.json"));

    // ── Phase 44: Initialize logger, throughput, monitor ──
    const effectiveLogDir = logDir || runDir;
    const logger = new TrainingLogger(effectiveLogDir);
    console.log(`  Log file: ${logger.logFilePath}`);

    const throughput = new ThroughputMeter();
    const monitor = enableMonitor
      ? new TrainingMonitor({ gradNormThreshold: cfg.training.maxGradNorm > 0 ? cfg.training.maxGradNorm * 2 : 10, autoAbort: false })
      : undefined;

    // ── Step 5: Record untrained generation (if requested) ──
    let untrainedGenResult: ReturnType<GenerationEvaluator["evaluate"]> | undefined;
    if (evalGenerate && tokenizer instanceof BPETokenizer) {
      console.log("[5/6] Recording untrained generation...");
      const genEval = new GenerationEvaluator(model, tokenizer);
      untrainedGenResult = genEval.evaluate([
        "Once upon a time",
        "The cat sat",
        "I went to",
      ], { seed: cfg.metadata.seed, maxTokens: 20, temperature: 0.8 });
      for (const r of untrainedGenResult) {
        console.log(`  "${r.prompt}" → "${r.generatedText.substring(0, 60)}..."`);
      }
    } else {
      console.log("[5/6] Training...");
    }

    // Step 6: Train
    if (evalGenerate) console.log("\n[6/6] Training...\n");
    else console.log("[5/6] Training...\n");

    throughput.start();

    const trainerConfig: TrainerConfig = {
      epochs: cfg.training.epochs,
      learningRate: cfg.training.learningRate,
      logInterval: 1,
      gradientAccumulationSteps: cfg.training.gradientAccumulationSteps,
    };

    const trainer = new Trainer({
      model,
      optimizer,
      trainLoader,
      config: trainerConfig,
      onLog: (info) => {
        // ── Throughput ──
        const tokensPerBatch = cfg.training.batchSize * cfg.dataset.blockSize;
        throughput.addTokens(tokensPerBatch);
        const tps = throughput.sample();

        // ── Gradient norm ──
        const gradNorm = computeGlobalNorm(model.parameters());

        // ── Monitor check ──
        if (monitor) {
          monitor.checkLoss(info.loss);
          monitor.checkLossSpike(info.loss);
          if (info.globalStep % 10 === 0) {
            monitor.checkParameters(model.parameters());
          }
        }

        // ── Structured log ──
        logger.log({
          step: info.globalStep,
          epoch: info.epoch,
          loss: info.loss,
          perplexity: info.perplexity,
          learningRate: optimizer.lr,
          tokensPerSecond: tps > 0 ? tps : undefined,
          gradientNorm: gradNorm > 0 ? gradNorm : undefined,
          timestamp: new Date().toISOString(),
        });

        // ── Console output ──
        const ts = new Date().toISOString().substring(11, 19);
        const tpsStr = tps > 0 ? ` | ${tps.toFixed(0)} tok/s` : "";
        console.log(
          `[${ts}] epoch ${info.epoch} | step ${info.globalStep} | ` +
          `loss ${info.loss.toFixed(4)} | ppl ${info.perplexity.toFixed(2)} | ` +
          `avg ${info.runningAverage.toFixed(4)}${tpsStr}`
        );

        // ── Metrics collector ──
        metrics.record({
          step: info.globalStep,
          epoch: info.epoch,
          loss: info.loss,
          learningRate: optimizer.lr,
          perplexity: info.perplexity,
          tokensPerSecond: tps > 0 ? tps : undefined,
          timestamp: Date.now(),
        });
        state.recordLoss(info.loss);
        state.advanceStep();

        // ── Intermediate checkpoint ──
        if (saveEvery > 0 && info.globalStep % saveEvery === 0) {
          const ckptPath = path.join(runDir, `checkpoint-step-${info.globalStep}.json`);
          const ckpt = saveCheckpoint({
            model,
            optimizer,
            scheduler,
            trainerState: state.snapshot(),
          });
          fs.writeFileSync(ckptPath, JSON.stringify(ckpt, null, 2), "utf-8");
        }
      },
      onEpochEnd: (info) => {
        // Step the scheduler once per epoch
        scheduler.step();
        console.log(
          `  → Epoch ${info.epoch} complete | avg loss ${info.epochAvgLoss.toFixed(4)} ` +
          `| best ${info.bestLoss.toFixed(4)} | lr ${optimizer.lr.toExponential(2)}`
        );
      },
    });

    const trainStart = Date.now();
    trainer.train();
    const trainDuration = (Date.now() - trainStart) / 1000;

    // ── Close logger with summary ──
    const logSummary = metrics.summarize();
    logger.close({
      totalSteps: state.globalStep,
      totalEpochs: cfg.training.epochs,
      bestLoss: state.bestLoss,
      finalLoss: logSummary?.finalLoss ?? 0,
      avgTokensPerSecond: throughput.averageTokensPerSecond,
      durationSeconds: trainDuration,
      completed: true,
    });

    // Save final checkpoint
    console.log("\nSaving checkpoint...");
    const checkpoint = saveCheckpoint({
      model,
      optimizer,
      scheduler,
      trainerState: state.snapshot(),
    });
    fs.writeFileSync(
      path.join(runDir, "checkpoint.json"),
      JSON.stringify(checkpoint, null, 2),
      "utf-8"
    );

    // Save metrics
    fs.writeFileSync(
      path.join(runDir, "metrics.json"),
      metrics.toJSON(),
      "utf-8"
    );

    // Save tokenizer
    if (tokenizer instanceof BPETokenizer) {
      fs.writeFileSync(
        path.join(runDir, "tokenizer.json"),
        JSON.stringify(tokenizer.toState(), null, 2),
        "utf-8"
      );
    }

    // ── Generation evaluation ──
    if (evalGenerate && tokenizer instanceof BPETokenizer && untrainedGenResult) {
      console.log("\nRunning generation evaluation...");
      const genEval = new GenerationEvaluator(model, tokenizer);
      const trainedGenResult = genEval.evaluate([
        "Once upon a time",
        "The cat sat",
        "I went to",
      ], { seed: cfg.metadata.seed, maxTokens: 20, temperature: 0.8 });

      const comparison = genEval.compare(untrainedGenResult, trainedGenResult);
      let changedCount = 0;
      for (const c of comparison) {
        console.log(`  Prompt: "${c.prompt}"`);
        console.log(`    Before: "${c.beforeText.substring(0, 50)}..."`);
        console.log(`    After:  "${c.afterText.substring(0, 50)}..."`);
        console.log(`    Changed: ${c.changed}, logProb Δ: ${c.logProbDelta.toFixed(4)}`);
        if (c.changed) changedCount++;
      }
      console.log(`\n  ${changedCount}/${comparison.length} prompts produced different output after training.`);
    }

    // ── Monitor summary ──
    if (monitor && monitor.hasAlerts) {
      const monSummary = monitor.summary;
      console.log(`\n⚠ Training Monitor: ${monSummary.alertCount} alerts ` +
        `(${monSummary.warningCount} warnings, ${monSummary.criticalCount} critical)`);
      for (const alert of monSummary.alerts) {
        console.log(`  [${alert.level.toUpperCase()}] ${alert.message}`);
      }
    }

    // Summary
    this.printHeader(`Training complete: ${cfg.metadata.name}`);
    const summary = metrics.summarize();
    if (summary) {
      console.log(`Final loss: ${summary.finalLoss?.toFixed(4) ?? "N/A"}`);
      console.log(`Best loss: ${summary.bestLoss?.toFixed(4) ?? "N/A"}`);
      console.log(`Avg throughput: ${throughput.averageTokensPerSecond.toFixed(0)} tok/s`);
      console.log(`Duration: ${trainDuration.toFixed(1)}s`);
    }
    console.log(`Output: ${runDir}`);
  }

  // ============================================================
  // Train-Experiment Command (Phase 46)
  // ============================================================

  private async trainExperiment(): Promise<void> {
    const configPath = this.args.options["config"];
    if (!configPath) {
      console.error("Error: --config <path> is required for train-experiment command");
      process.exit(1);
    }

    const outputDir = this.args.options["output"] ?? "";
    const seedOverride = this.args.options["seed"];
    const resume = this.args.options["resume"] === "true";

    console.log(`Loading experiment config from: ${configPath}`);
    const config = ExperimentConfig.fromFile(configPath);
    const cfg = config.data;

    // Apply seed override
    if (seedOverride) {
      cfg.seed = parseInt(seedOverride, 10);
    }

    this.printHeader(`MiniMind Training Experiment: ${cfg.name}`);
    console.log(`Model: ${cfg.model.preset} | dModel=${cfg.model.dModel ?? "auto"}, heads=${cfg.model.numHeads ?? "auto"}`);
    console.log(`Dataset: ${cfg.dataset.type} | blockSize=${cfg.dataset.blockSize}, batchSize=${cfg.dataset.batchSize}`);
    console.log(`Optimizer: ${cfg.optimizer.type} | lr=${cfg.optimizer.lr}, wd=${cfg.optimizer.weightDecay ?? 0.01}`);
    console.log(`Scheduler: ${cfg.scheduler.type}`);
    console.log(`Training: ${cfg.training.epochs} epochs, gradAcc=${cfg.training.gradientAccumulationSteps ?? 1}`);
    console.log(`Seed: ${cfg.seed}`);
    if (resume) console.log(`Resume: enabled (checkpoint will be loaded if exists)`);
    console.log(`${"=".repeat(60)}\n`);

    // Run the experiment
    const effectiveOutputDir = outputDir || cfg.output.dir;

    console.log("Starting training experiment...\n");
    const trainStart = Date.now();

    const result = await runExperimentFromConfigFile(configPath, {
      runGenerationEval: true,
      saveToDisk: true,
      outputDir: effectiveOutputDir,
    });

    const trainDuration = (Date.now() - trainStart) / 1000;

    // ── Print results ──
    this.printHeader("Training Complete");
    console.log(`Model: TensorMiniMindModel`);
    console.log(`Dataset: ${cfg.dataset.type}`);
    console.log("");
    console.log(`Steps: ${result.totalSteps.toLocaleString()}`);
    console.log("");
    console.log("Loss:");
    const firstMetric = result.metrics.getRecords()[0];
    const initialLoss = firstMetric?.loss ?? 0;
    console.log(`  ${initialLoss.toFixed(2)} → ${result.finalLoss.toFixed(2)}`);
    console.log("");
    console.log("Perplexity:");
    const initialPpl = initialLoss > 0 ? Math.exp(Math.min(initialLoss, 709)) : 0;
    console.log(`  ${initialPpl.toFixed(0)} → ${result.perplexity.toFixed(2)}`);
    console.log("");

    // ── Generation comparison ──
    if (result.generationComparison && result.generationComparison.length > 0) {
      console.log("Generation:");
      console.log("");
      let changedCount = 0;
      for (const c of result.generationComparison) {
        console.log(`  Before: "${c.beforeText.substring(0, 60)}..."`);
        console.log(`  After:  "${c.afterText.substring(0, 60)}..."`);
        if (c.changed) changedCount++;
        console.log("");
      }
      console.log(`  ${changedCount}/${result.generationComparison.length} prompts changed after training.`);
      console.log("");
    }

    // ── Paths ──
    if (result.checkpointPath) {
      console.log(`Checkpoint saved: ${result.checkpointPath}`);
    }
    if (result.reportPath) {
      console.log(`Report: ${result.reportPath}`);
    }

    // ── Generate Markdown report ──
    if (result.reportPath) {
      const report = TrainingReport.fromExperimentResult(result, {
        seed: cfg.seed,
        configSource: configPath,
      });

      const reportDir = result.reportPath.substring(
        0,
        result.reportPath.lastIndexOf(path.sep)
      );
      const mdPath = path.join(reportDir, "report.md");
      report.saveMarkdown(mdPath);
      console.log(`Markdown report: ${mdPath}`);
    }

    console.log("");
    console.log(`Duration: ${trainDuration.toFixed(1)}s`);
    console.log(`Best loss: ${result.bestLoss.toFixed(4)}`);
    console.log(`Throughput: ~${(result.totalSteps * cfg.dataset.blockSize / Math.max(trainDuration, 0.1)).toFixed(0)} tokens/s`);
  }

  // ============================================================
  // Evaluate Command
  // ============================================================

  private async evaluate(): Promise<void> {
    const modelPath = this.args.options["model"];
    if (!modelPath) {
      console.error("Error: --model <path> is required for evaluate command");
      process.exit(1);
    }
    if (!fs.existsSync(modelPath)) {
      console.error(`Error: checkpoint file not found: ${modelPath}`);
      process.exit(1);
    }

    this.printHeader("MiniMind Evaluation");

    // Load checkpoint data
    const checkpointRaw = JSON.parse(fs.readFileSync(modelPath, "utf-8"));

    // Load tokenizer if available
    const ckptDir = path.dirname(modelPath);
    const tokPath = path.join(ckptDir, "tokenizer.json");
    let tokenizer: BPETokenizer;
    if (fs.existsSync(tokPath)) {
      tokenizer = new BPETokenizer();
      tokenizer.fromState(JSON.parse(fs.readFileSync(tokPath, "utf-8")));
    } else {
      tokenizer = new BPETokenizer();
    }

    // Reconstruct model from checkpoint metadata
    const modelParams = checkpointRaw.modelParams as Array<{ name: string; shape: number[] }>;
    const vocabSize = this.extractVocabSize(modelParams);

    const model = new TensorMiniMindModel({
      vocabSize,
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: this.inferNumLayers(modelParams),
      maxSeqLen: 128,
    });

    // Restore parameters
    const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.001 });
    loadCheckpoint({ model, optimizer, checkpoint: checkpointRaw });

    // Evaluate on inline test sentences
    const testSentences = [
      "the cat sat on the mat",
      "the dog ran in the park",
      "once upon a time there was a princess",
      "the sun was shining brightly",
      "a bird flew over the tall tree",
    ];

    const dataset = new TextDataset({
      tokenizer: tokenizer as ITokenizer,
      corpus: testSentences,
      blockSize: 16,
    });

    console.log(`Test samples: ${dataset.length()}`);

    let totalLoss = 0;
    let totalTokens = 0;

    for (let i = 0; i < dataset.length(); i++) {
      const sample = dataset.get(i);
      const inputIds = Tensor.fromArray([sample.inputIds]);
      const targetIds = sample.targetIds;

      Tensor.noGrad(() => {
        const logits = model.forward(inputIds);
        const loss = crossEntropyLoss(logits, [targetIds]);
        totalLoss += loss.item() * targetIds.length;
        totalTokens += targetIds.length;
      });
    }

    const avgLoss = totalTokens > 0 ? totalLoss / totalTokens : Infinity;
    const perplexity = Math.exp(Math.min(avgLoss, 20)); // clamp to avoid overflow

    console.log(`\nAverage Loss: ${avgLoss.toFixed(4)}`);
    console.log(`Perplexity: ${perplexity.toFixed(2)}`);
    console.log(`Tokens evaluated: ${totalTokens}`);
  }

  // ============================================================
  // Generate Command
  // ============================================================

  private async generate(): Promise<void> {
    const modelPath = this.args.options["model"];
    const prompt = this.args.options["prompt"] ?? "";
    const maxTokens = parseInt(this.args.options["max-tokens"] ?? "30", 10);
    const temperature = parseFloat(this.args.options["temperature"] ?? "0.8");
    const topK = parseInt(this.args.options["top-k"] ?? "40", 10);
    const topP = parseFloat(this.args.options["top-p"] ?? "0.9");

    if (!modelPath) {
      console.error("Error: --model <path> is required for generate command");
      process.exit(1);
    }
    if (!fs.existsSync(modelPath)) {
      console.error(`Error: checkpoint file not found: ${modelPath}`);
      process.exit(1);
    }

    this.printHeader("MiniMind Generation");
    console.log(`Prompt: "${prompt}"`);
    console.log(`Temp: ${temperature}, Top-K: ${topK}, Top-P: ${topP}, Max: ${maxTokens}\n`);

    // Load checkpoint
    const checkpointRaw = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
    const ckptDir = path.dirname(modelPath);
    const tokPath = path.join(ckptDir, "tokenizer.json");

    let tokenizer: BPETokenizer;
    if (fs.existsSync(tokPath)) {
      tokenizer = new BPETokenizer();
      tokenizer.fromState(JSON.parse(fs.readFileSync(tokPath, "utf-8")));
    } else {
      tokenizer = new BPETokenizer();
    }

    const modelParams = checkpointRaw.modelParams as Array<{ name: string; shape: number[] }>;
    const vocabSize = this.extractVocabSize(modelParams);

    const model = new TensorMiniMindModel({
      vocabSize,
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: this.inferNumLayers(modelParams),
      maxSeqLen: 128,
    });

    const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.001 });
    loadCheckpoint({ model, optimizer, checkpoint: checkpointRaw });

    // Encode prompt
    const promptIds = prompt ? tokenizer.encode(prompt) : [];
    const generated = this.tensorGenerate(model, tokenizer, promptIds, {
      maxTokens,
      temperature,
      topK,
      topP,
    });

    console.log("Generated text:");
    console.log("-".repeat(40));
    console.log(prompt + generated);
    console.log("-".repeat(40));
  }

  // ============================================================
  // Tensor-based generation
  // ============================================================

  private tensorGenerate(
    model: TensorMiniMindModel,
    tokenizer: BPETokenizer,
    promptIds: number[],
    opts: { maxTokens: number; temperature: number; topK: number; topP: number }
  ): string {
    const generated: number[] = [];
    const currentIds = [...promptIds];
    const maxCtx = 128;

    for (let step = 0; step < opts.maxTokens; step++) {
      const ctx = currentIds.length > maxCtx
        ? currentIds.slice(currentIds.length - maxCtx)
        : currentIds;
      const input = Tensor.fromArray([ctx]);
      let nextTokenId = 0;

      Tensor.noGrad(() => {
        const logits = model.forward(input);
        const logitArr = logits.toArray() as number[][][];
        const lastLogits = logitArr[0][Math.min(ctx.length - 1, logitArr[0].length - 1)];

        // Temperature scaling
        const scaled = lastLogits.map((l: number) => l / Math.max(opts.temperature, 1e-8));

        // Softmax
        const maxL = Math.max(...scaled);
        const expSum = scaled.reduce((s: number, l: number) => s + Math.exp(l - maxL), 0);
        const probs = scaled.map((l: number) => Math.exp(l - maxL) / expSum);

        // Top-K
        if (opts.topK > 0 && opts.topK < probs.length) {
          const sorted = probs.map((p: number, i: number) => ({ p, i })).sort((a, b) => b.p - a.p);
          const cutoff = sorted[Math.min(opts.topK - 1, sorted.length - 1)].p;
          for (let i = 0; i < probs.length; i++) {
            if (probs[i] < cutoff) probs[i] = 0;
          }
          const sum = probs.reduce((s, p) => s + p, 0);
          if (sum > 0) for (let i = 0; i < probs.length; i++) probs[i] /= sum;
        }

        // Top-P (nucleus)
        if (opts.topP < 1.0) {
          const sorted = probs.map((p: number, i: number) => ({ p, i })).sort((a, b) => b.p - a.p);
          let cum = 0;
          const keep = new Set<number>();
          for (const { p, i } of sorted) {
            cum += p;
            keep.add(i);
            if (cum >= opts.topP) break;
          }
          for (let i = 0; i < probs.length; i++) {
            if (!keep.has(i)) probs[i] = 0;
          }
          const sum = probs.reduce((s, p) => s + p, 0);
          if (sum > 0) for (let i = 0; i < probs.length; i++) probs[i] /= sum;
        }

        // Sample from distribution
        const r = Math.random();
        let cumProb = 0;
        for (let i = 0; i < probs.length; i++) {
          cumProb += probs[i];
          if (r < cumProb) {
            nextTokenId = i;
            break;
          }
        }
      });

      generated.push(nextTokenId);
      currentIds.push(nextTokenId);

      // EOS check
      if (nextTokenId === 3) break;
    }

    return tokenizer.decode(generated);
  }

  // ============================================================
  // Research Command (Phase 62)
  // ============================================================

  private async research(): Promise<void> {
    const subCommand = this.args.options["_sub"] ?? "help";

    switch (subCommand) {
      case "benchmark":
        await this.researchBenchmark();
        break;
      case "compare":
        await this.researchCompare();
        break;
      case "fingerprint":
        await this.researchFingerprint();
        break;
      case "study":
        await this.researchStudy();
        break;
      default:
        this.printResearchUsage();
        break;
    }
  }

  // ── research study ──

  private async researchStudy(): Promise<void> {
    const studyName = this.args.options["study"] ?? "gradient-clipping";
    const outputDir = this.args.options["output"] ?? "docs/research/studies";
    const numRuns = parseInt(this.args.options["runs"] ?? "2", 10);
    const seed = parseInt(this.args.options["seed"] ?? "42", 10);
    const skipValidation = this.args.options["skip-validation"] === "true";

    if (studyName !== "gradient-clipping") {
      console.error(
        `Error: unknown study "${studyName}". Available: gradient-clipping`,
      );
      process.exit(1);
    }

    // Lazy-load the gradient clipping study
    const {
      baselineExperiment,
      clippedExperiment,
      gradientClippingStudy,
      STUDY_CORPUS,
    } = await import(
      "../research/studies/gradient-clipping/study"
    );

    this.printHeader(
      `Research Study: ${gradientClippingStudy.name}`,
    );
    console.log(`Research Question: ${gradientClippingStudy.researchQuestion}`);
    console.log(`Hypothesis: ${gradientClippingStudy.hypothesis}`);
    console.log(
      `Independent Variable: ${gradientClippingStudy.independentVariable.name}` +
        ` (${gradientClippingStudy.independentVariable.baselineValue} → ${gradientClippingStudy.independentVariable.variantValue})`,
    );
    console.log(`Runs per condition: ${numRuns}`);
    console.log(`Seed: ${seed}`);
    console.log(
      `${"=".repeat(60)}\n`,
    );

    // Step 1: Validate controlled variables
    if (!skipValidation) {
      console.log("[1/4] Validating controlled variables...");
      const { verifyControlledVariables } = await import(
        "../research/ControlledVariableValidator"
      );
      const validation = verifyControlledVariables(
        baselineExperiment,
        clippedExperiment,
        "gradientClipNorm",
      );
      if (!validation.valid) {
        console.error("❌ Controlled variable validation FAILED:");
        console.error(`   ${validation.error}`);
        console.error("");
        console.error(
          "To skip validation, use --skip-validation true",
        );
        process.exit(1);
      }
      console.log("✅ All controlled variables are identical");
      console.log(`   ${validation.summary}`);
    } else {
      console.log("[1/4] Skipping validation (--skip-validation)");
    }

    // Step 2: Run experiments
    console.log("\n[2/4] Running experiments (this may take 30-60s)...");

    const { ResearchBenchmarkRunner } = await import(
      "../research/benchmark/ResearchBenchmarkRunner"
    );
    const { BenchmarkSuite } = await import(
      "../research/benchmark/BenchmarkSuite"
    );

    const runner = new ResearchBenchmarkRunner();

    const baselineProfile = {
      name: "Baseline (no clip)",
      modelConfig: baselineExperiment.modelConfig,
      trainingConfig: baselineExperiment.trainingConfig,
      datasetConfig: baselineExperiment.datasetConfig,
      tokenizerConfig: baselineExperiment.tokenizerConfig,
      evaluationConfig: baselineExperiment.evaluationConfig,
      numRuns,
      seed,
      corpus: STUDY_CORPUS,
    };

    const clippedProfile = {
      name: "Clipped (norm=1.0)",
      modelConfig: clippedExperiment.modelConfig,
      trainingConfig: clippedExperiment.trainingConfig,
      datasetConfig: clippedExperiment.datasetConfig,
      tokenizerConfig: clippedExperiment.tokenizerConfig,
      evaluationConfig: clippedExperiment.evaluationConfig,
      numRuns,
      seed,
      corpus: STUDY_CORPUS,
    };

    const suite = new BenchmarkSuite("Gradient Clipping Study");
    suite.addProfile("baseline", baselineProfile, {
      label: "Baseline (no clip)",
      isBaseline: true,
    });
    suite.addProfile("clipped", clippedProfile, {
      label: "Clipped (norm=1.0)",
    });

    const suiteResult = await suite.runAll(runner, {
      name: "Gradient Clipping Study",
      numRuns,
      baseSeed: seed,
    });

    const baselineResult = suiteResult.members.find(
      (m) => m.member.key === "baseline",
    )!;
    const clippedResult = suiteResult.members.find(
      (m) => m.member.key === "clipped",
    )!;

    console.log(
      `  ✅ Baseline: best loss=${baselineResult.report.metrics.bestLoss.mean.toFixed(4)}`,
    );
    console.log(
      `  ✅ Clipped:  best loss=${clippedResult.report.metrics.bestLoss.mean.toFixed(4)}`,
    );

    // Step 3: Generate report
    console.log("\n[3/4] Generating research report...");

    const { createBenchmarkResearchReport, reportToJSON, reportToMarkdown } =
      await import("../research/benchmark/ResearchBenchmarkReport");

    // Build standard benchmark report
    const benchmarkReport = createBenchmarkResearchReport(
      suiteResult,
      "Gradient Clipping Study — MiniMind Research Phase 63",
    );

    // Enhance with gradient-specific analysis
    const blRuns = baselineResult.result.runs;
    const clRuns = clippedResult.result.runs;

    const gradientAnalysis: Record<string, unknown> = {};
    for (const metric of [
      "meanGradientNorm",
      "maxGradientNorm",
      "gradientNormVariance",
    ]) {
      const blVals = blRuns.map((r) => r[metric as keyof typeof r] as number);
      const clVals = clRuns.map((r) => r[metric as keyof typeof r] as number);
      const blMean = blVals.reduce((a, b) => a + b, 0) / blVals.length;
      const clMean = clVals.reduce((a, b) => a + b, 0) / clVals.length;
      const pctChange =
        blMean !== 0 ? ((clMean - blMean) / Math.abs(blMean)) * 100 : 0;

      gradientAnalysis[metric] = {
        baseline: { mean: blMean, values: blVals },
        clipped: { mean: clMean, values: clVals },
        changePercent: pctChange,
      };
    }

    // Compute conclusion
    const baselineLoss = baselineResult.report.metrics.bestLoss;
    const clippedLoss = clippedResult.report.metrics.bestLoss;
    const lossChangePct =
      baselineLoss.mean > 0
        ? ((clippedLoss.mean - baselineLoss.mean) / baselineLoss.mean) * 100
        : 0;

    const maxNormBl =
      (gradientAnalysis["maxGradientNorm"] as Record<string, { mean: number }>)
        ?.baseline?.mean ?? 0;
    const maxNormCl =
      (gradientAnalysis["maxGradientNorm"] as Record<string, { mean: number }>)
        ?.clipped?.mean ?? 0;
    const baselineDiv = blRuns.filter((r) => r.divergenceDetected).length;
    const clippedDiv = clRuns.filter((r) => r.divergenceDetected).length;

    let verdict: string;
    if (
      maxNormCl < maxNormBl * 0.8 &&
      clippedLoss.mean <= baselineLoss.mean * 1.02 &&
      clippedDiv === 0
    ) {
      verdict = "SUPPORTED ✅";
    } else if (clippedLoss.mean > baselineLoss.mean * 1.05) {
      verdict = "REJECTED ❌";
    } else {
      verdict = "INCONCLUSIVE ⚠️";
    }

    const enhancedReport = {
      ...benchmarkReport,
      study: {
        id: gradientClippingStudy.id,
        researchQuestion: gradientClippingStudy.researchQuestion,
        hypothesis: gradientClippingStudy.hypothesis,
      },
      gradientAnalysis,
      conclusion: {
        verdict,
        lossChangePercent: lossChangePct,
        baselineBestLoss: baselineLoss.mean,
        clippedBestLoss: clippedLoss.mean,
        baselineMaxNorm: maxNormBl,
        clippedMaxNorm: maxNormCl,
        baselineDivergences: baselineDiv,
        clippedDivergences: clippedDiv,
      },
    };

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const jsonPath = path.join(
      outputDir,
      `gradient-clipping-study-${ts}.json`,
    );
    const mdPath = path.join(
      outputDir,
      `gradient-clipping-study-${ts}.md`,
    );

    fs.writeFileSync(
      jsonPath,
      JSON.stringify(enhancedReport, null, 2),
      "utf-8",
    );
    fs.writeFileSync(mdPath, reportToMarkdown(benchmarkReport), "utf-8");

    console.log(`  ✅ JSON report: ${jsonPath}`);
    console.log(`  ✅ Markdown report: ${mdPath}`);

    // Step 4: Print results
    console.log(`\n[4/4] Study Results`);
    console.log("-".repeat(40));
    console.log(suite.formatResults(suiteResult));
    console.log("");
    console.log(`Conclusion: ${verdict}`);
    console.log(
      `Loss change: ${lossChangePct > 0 ? "+" : ""}${lossChangePct.toFixed(1)}%`,
    );
    console.log(
      `Max gradient norm: ${maxNormBl.toFixed(2)} → ${maxNormCl.toFixed(2)} ` +
        `(${(((maxNormCl - maxNormBl) / Math.max(Math.abs(maxNormBl), 1e-8)) * 100).toFixed(1)}%)`,
    );

    const totalDuration = (
      (suiteResult.completedAt - suiteResult.startedAt) /
      1000
    ).toFixed(1);
    console.log(`Total duration: ${totalDuration}s`);
    console.log("\n✅ Study complete. Reports saved to disk.");
  }

  // ── research benchmark ──

  private async researchBenchmark(): Promise<void> {
    const modelName = this.args.options["model"] ?? "tiny";
    const recipeName = this.args.options["recipe"] ?? "tiny-overfit-test";
    const suiteType = this.args.options["suite"] ?? "scale";
    const numRuns = parseInt(this.args.options["runs"] ?? "2", 10);
    const outputDir = this.args.options["output"] ?? ".cache/minimind/benchmarks";
    const seed = parseInt(this.args.options["seed"] ?? "42", 10);

    // Get model config
    let modelConfig;
    try {
      modelConfig = getModelConfig(modelName);
    } catch {
      console.error(`Error: model "${modelName}" not found.`);
      console.error(`Available: ${listModels().map((m) => m.name).join(", ")}`);
      process.exit(1);
    }

    // Get training recipe
    let recipe;
    try {
      recipe = loadRecipe(recipeName);
    } catch {
      console.error(`Error: recipe "${recipeName}" not found.`);
      console.error(`Available: ${listRecipes().map((r) => r.name).join(", ")}`);
      process.exit(1);
    }

    this.printHeader(`Research Benchmark: ${modelName} + ${recipeName}`);
    console.log(`Suite: ${suiteType}`);
    console.log(`Runs per config: ${numRuns}`);
    console.log(`Seed: ${seed}`);

    // Build base profile
    const corpus = this.defaultInlineCorpus();
    const baseProfile: Omit<ResearchBenchmarkProfile, "name" | "modelConfig"> = {
      trainingConfig: recipe,
      datasetConfig: {
        name: "inline",
        blockSize: 64,
        batchSize: recipe.dataset.batchSize ?? 8,
        shuffle: true,
      },
      tokenizerConfig: {
        type: "bpe",
        vocabSize: modelConfig.vocabSize ?? 32000,
      },
      evaluationConfig: {
        generationPrompts: ["the", "once upon", "in the"],
        maxTokens: 20,
        temperature: 0.8,
        runGenerationComparison: true,
        runBenchmarks: true,
      },
      numRuns,
      seed,
      corpus,
    };

    // Build suite based on type
    let suite: BenchmarkSuite;
    switch (suiteType) {
      case "scale": {
        const models = listModels();
        suite = createModelScaleSuite(
          baseProfile,
          models.map((m) => ({
            key: m.name,
            label: m.label,
            config: m,
          }))
        );
        break;
      }
      case "lr": {
        const lrs = [0.0001, 0.0003, 0.001, 0.003, 0.01];
        suite = createLearningRateSuite(
          {
            ...baseProfile,
            name: `LR Sweep — ${modelConfig.label}`,
            modelConfig,
          },
          lrs
        );
        break;
      }
      case "batch": {
        const batchSizes = [4, 8, 16, 32];
        suite = createLearningRateSuite(
          {
            ...baseProfile,
            name: `Batch Sweep — ${modelConfig.label}`,
            modelConfig,
          },
          batchSizes
        );
        // Fix: use batch suite instead
        suite = new BenchmarkSuite("Batch Size Sweep");
        for (let i = 0; i < batchSizes.length; i++) {
          const bs = batchSizes[i];
          suite.addProfile(
            `batch-${bs}`,
            {
              ...baseProfile,
              name: `Batch Size — batch=${bs}`,
              modelConfig,
              datasetConfig: {
                ...baseProfile.datasetConfig,
                batchSize: bs,
              },
            },
            {
              label: `batch=${bs}`,
              metadata: { type: "batch-sweep", batchSize: String(bs) },
              isBaseline: i === 0,
            }
          );
        }
        break;
      }
      default: {
        // Default: single-model benchmark
        suite = new BenchmarkSuite(`Benchmark: ${modelConfig.label}`);
        suite.addProfile(
          modelName,
          {
            ...baseProfile,
            name: `${modelConfig.label} @ ${recipe.name}`,
            modelConfig,
          },
          {
            label: modelConfig.label,
            isBaseline: true,
          }
        );
      }
    }

    console.log(`\nSuite members: ${suite.size}`);
    console.log("Starting benchmarks...\n");

    // Run benchmarks
    const runner = new ResearchBenchmarkRunner();
    const startedAt = Date.now();

    const suiteResult = await suite.runAll(runner, {
      name: suite.name,
      numRuns,
      baseSeed: seed,
    });

    const duration = (Date.now() - startedAt) / 1000;

    // Generate report
    const report = createBenchmarkResearchReport(suiteResult);
    const reportJSON = reportToJSON(report);
    const reportMD = reportToMarkdown(report);

    // Save to output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const suiteSlug = suite.name.replace(/\s+/g, "-").toLowerCase();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    const jsonPath = path.join(outputDir, `${suiteSlug}-${ts}.json`);
    const mdPath = path.join(outputDir, `${suiteSlug}-${ts}.md`);

    fs.writeFileSync(jsonPath, reportJSON, "utf-8");
    fs.writeFileSync(mdPath, reportMD, "utf-8");

    // Print results
    console.log(suite.formatResults(suiteResult));
    console.log(`\nDuration: ${duration.toFixed(1)}s`);
    console.log(`\nReports saved:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  MD:   ${mdPath}`);
  }

  // ── research compare ──

  private async researchCompare(): Promise<void> {
    const reportA = this.args.options["a"];
    const reportB = this.args.options["b"];

    if (!reportA || !reportB) {
      console.error("Error: --a <path> and --b <path> are required for research compare");
      process.exit(1);
    }

    if (!fs.existsSync(reportA)) {
      console.error(`Error: report not found: ${reportA}`);
      process.exit(1);
    }
    if (!fs.existsSync(reportB)) {
      console.error(`Error: report not found: ${reportB}`);
      process.exit(1);
    }

    this.printHeader("Research Compare");

    const jsonA = JSON.parse(fs.readFileSync(reportA, "utf-8"));
    const jsonB = JSON.parse(fs.readFileSync(reportB, "utf-8"));

    const nameA = jsonA?.meta?.title ?? path.basename(reportA);
    const nameB = jsonB?.meta?.title ?? path.basename(reportB);

    console.log(`Report A: ${nameA}`);
    console.log(`Report B: ${nameB}`);
    console.log("");

    // Compare metrics
    const membersA = jsonA?.members as Array<{
      label: string;
      metrics: { bestLoss: { mean: number; std: number }; throughput: { mean: number } };
    }> | undefined;
    const membersB = jsonB?.members as Array<{
      label: string;
      metrics: { bestLoss: { mean: number; std: number }; throughput: { mean: number } };
    }> | undefined;

    if (!membersA || !membersB) {
      console.error("Error: one or both reports are missing member data.");
      process.exit(1);
    }

    console.log("─ Best Loss Comparison ─");
    console.log(
      "Configuration".padEnd(20) +
      `${nameA}`.padStart(16) +
      `${nameB}`.padStart(16) +
      "Diff".padStart(12)
    );
    console.log("-".repeat(64));

    for (let i = 0; i < Math.max(membersA.length, membersB.length); i++) {
      const ma = membersA[i];
      const mb = membersB[i];
      if (!ma || !mb) continue;

      const diff =
        mb.metrics.bestLoss.mean > 0
          ? ((ma.metrics.bestLoss.mean - mb.metrics.bestLoss.mean) /
              mb.metrics.bestLoss.mean) *
            100
          : 0;
      const sign = diff < 0 ? "↓" : diff > 0 ? "↑" : " ";

      console.log(
        ma.label.padEnd(20) +
        ma.metrics.bestLoss.mean.toFixed(4).padStart(16) +
        mb.metrics.bestLoss.mean.toFixed(4).padStart(16) +
        `${sign}${Math.abs(diff).toFixed(1)}%`.padStart(12)
      );
    }

    console.log("");
    console.log("─ Throughput Comparison ─");
    console.log(
      "Configuration".padEnd(20) +
      `${nameA}`.padStart(16) +
      `${nameB}`.padStart(16) +
      "Ratio".padStart(10)
    );
    console.log("-".repeat(62));

    for (let i = 0; i < Math.max(membersA.length, membersB.length); i++) {
      const ma = membersA[i];
      const mb = membersB[i];
      if (!ma || !mb) continue;

      const ratio =
        mb.metrics.throughput.mean > 0
          ? ma.metrics.throughput.mean / mb.metrics.throughput.mean
          : 0;

      console.log(
        ma.label.padEnd(20) +
        `${ma.metrics.throughput.mean.toFixed(0)} tok/s`.padStart(16) +
        `${mb.metrics.throughput.mean.toFixed(0)} tok/s`.padStart(16) +
        `${ratio.toFixed(2)}×`.padStart(10)
      );
    }
  }

  // ── research fingerprint ──

  private async researchFingerprint(): Promise<void> {
    const modelName = this.args.options["model"] ?? "tiny";
    const recipeName = this.args.options["recipe"] ?? "tiny-overfit-test";
    const seed = parseInt(this.args.options["seed"] ?? "42", 10);

    const modelConfig = getModelConfig(modelName);
    const recipe = loadRecipe(recipeName);

    this.printHeader("Research Fingerprint");

    const identity = extractExperimentIdentity({
      seed,
      modelConfig,
      trainingConfig: {
        ...recipe,
        optimizer: {
          lr: recipe.optimizer.lr,
          weightDecay: recipe.optimizer.weightDecay,
          type: recipe.optimizer.type ?? "adamw",
        },
      },
      datasetConfig: {
        name: "inline",
        blockSize: 64,
        batchSize: recipe.dataset.batchSize ?? 8,
        shuffle: true,
      },
      tokenizerConfig: {
        type: "bpe",
        vocabSize: modelConfig.vocabSize ?? 32000,
      },
    });

    const fingerprint = createExperimentFingerprint(identity);
    console.log(formatFingerprint(fingerprint));
    console.log("");

    // If two fingerprints are provided, compare them
    const compareWith = this.args.options["compare-with"];
    if (compareWith) {
      if (!fs.existsSync(compareWith)) {
        console.error(`Error: fingerprint file not found: ${compareWith}`);
        process.exit(1);
      }
      const other = JSON.parse(fs.readFileSync(compareWith, "utf-8"));
      const comparison = compareExperimentIdentity(fingerprint, other);
      console.log(comparison.summary);
    }
  }

  private printResearchUsage(): void {
    console.log(`
MiniMind Research Commands (Phase 62)

Usage:
  npx tsx src/lib/minimind/cli/minimind-cli.ts research <sub-command> [options]

Sub-commands:
  benchmark  --model <name> --recipe <name>     Run a research benchmark suite
             [--suite scale|lr|batch]            Suite type (default: scale)
             [--runs N]                          Runs per config (default: 2)
             [--output <dir>]                    Output directory
             [--seed N]                          Random seed (default: 42)

  compare    --a <path> --b <path>              Compare two benchmark reports

  fingerprint --model <name> --recipe <name>    Generate experiment fingerprint
             [--compare-with <path>]             Compare with existing fingerprint

  study       [--study <name>]                  Reproduce a research study
             [--runs N] [--seed N]               Runs per condition (default: 2)
             [--output <dir>]                    Output directory
             [--skip-validation]                 Skip controlled variable check

Examples:
  npx tsx src/lib/minimind/cli/minimind-cli.ts research benchmark --model tiny --recipe tiny-overfit-test
  npx tsx src/lib/minimind/cli/minimind-cli.ts research benchmark --suite lr --runs 3
  npx tsx src/lib/minimind/cli/minimind-cli.ts research compare --a report-a.json --b report-b.json
  npx tsx src/lib/minimind/cli/minimind-cli.ts research fingerprint --model small --recipe tinystories-small
  npx tsx src/lib/minimind/cli/minimind-cli.ts research study --study gradient-clipping --runs 2
  npx tsx src/lib/minimind/cli/minimind-cli.ts research study --output ./my-results
`);
  }

  // ============================================================
  // Helpers
  // ============================================================

  private printHeader(title: string): void {
    console.log(`\n${"=".repeat(60)}`);
    console.log(title);
    console.log(`${"=".repeat(60)}`);
  }

  private printUsage(): void {
    console.log(`
MiniMind CLI — Real GPT Training Runtime

Usage:
  npx tsx src/lib/minimind/cli/minimind-cli.ts <command> [options]

Commands:
  train            --config <path>                  Train a model from config
                   [--log-dir <path>] [--monitor]
                   [--save-every N] [--eval-generate]
  train-experiment --config <path>                  Reproducible experiment (Phase 46)
                   [--output <dir>] [--seed N]
                   [--resume]
  evaluate         --model <path>                   Evaluate a trained model
  generate         --model <path> --prompt <text>   Generate text from model
                   [--max-tokens N] [--temperature T]
                   [--top-k K] [--top-p P]
  research         <sub-command> [options]          Research benchmark & analysis
    benchmark        --model <name> --recipe <name> Run benchmark suite
    compare          --a <path> --b <path>          Compare benchmark reports
    fingerprint      --model <name> --recipe <name> Generate config fingerprint
    study            [--study <name>]               Reproduce a research study

Examples:
  npx tsx src/lib/minimind/cli/minimind-cli.ts train --config train-config.json
  npx tsx src/lib/minimind/cli/minimind-cli.ts train-experiment --config experiments/configs/tinystories-tiny.json
  npx tsx src/lib/minimind/cli/minimind-cli.ts evaluate --model runs/checkpoint.json
  npx tsx src/lib/minimind/cli/minimind-cli.ts generate --model runs/checkpoint.json --prompt "Once upon"
`);
  }

  private async prepareTokenizer(cfg: TrainingConfigFile): Promise<ITokenizer> {
    if (cfg.tokenizer.type === "load" && cfg.tokenizer.statePath) {
      const tok = new BPETokenizer();
      tok.fromState(JSON.parse(fs.readFileSync(cfg.tokenizer.statePath, "utf-8")));
      return tok as ITokenizer;
    }

    const tok = new BPETokenizer();
    const corpus = await this.loadRawCorpus(cfg);
    const targetVocab = cfg.tokenizer.vocabSize ?? 1024;
    console.log(`  Training BPE tokenizer (${corpus.length} docs, target: ${targetVocab})...`);
    tok.train(corpus, targetVocab, (current, target) => {
      if (current % 200 === 0) {
        process.stdout.write(`  Tokenizer: ${current}/${target}\r`);
      }
    });
    console.log(`  Tokenizer: ${tok.vocabSize} tokens`);
    return tok as ITokenizer;
  }

  private async loadRawCorpus(cfg: TrainingConfigFile): Promise<string[]> {
    switch (cfg.dataset.type) {
      case "tinystories": {
        const ds = await TinyStoriesDataset.load({
          split: cfg.dataset.split ?? "train",
          maxStories: cfg.dataset.maxDocuments,
        });
        return ds.stories();
      }
      case "textfile": {
        if (!cfg.dataset.path) throw new Error("dataset.path required for textfile type");
        const content = fs.readFileSync(cfg.dataset.path, "utf-8");
        return content.split(/\n\s*\n/).filter((s) => s.trim().length > 0);
      }
      case "inline":
        return this.defaultInlineCorpus();
      default:
        throw new Error(`Unknown dataset type: ${cfg.dataset.type}`);
    }
  }

  private defaultInlineCorpus(): string[] {
    const sentences = [
      "the cat sat on the mat",
      "the dog ran in the park",
      "once upon a time there was a princess",
      "the sun was shining brightly in the sky",
      "a bird flew over the tall tree",
      "the fish swam in the clear water",
      "the boy played with his red ball",
      "a beautiful rainbow appeared after the rain",
      "the girl read a book under the lamp",
      "the horse jumped over the fence",
    ];
    return Array.from({ length: 100 }, (_, i) => sentences[i % sentences.length]);
  }

  private extractVocabSize(params: Array<{ name: string; shape: number[] }>): number {
    // Find embedding weight: shape [vocabSize, dModel]
    const emb = params.find((p) => p.name === "embedding.weight");
    if (emb) return emb.shape[0];
    // Fallback: find lmHead.linear.weight: shape [dModel, vocabSize]
    const lmHead = params.find((p) => p.name === "lmHead.linear.weight");
    if (lmHead) return lmHead.shape[1];
    return 1024; // default
  }

  private inferNumLayers(params: Array<{ name: string; shape: number[] }>): number {
    let maxLayer = -1;
    for (const p of params) {
      const m = p.name.match(/^blocks\.(\d+)\./);
      if (m) {
        const idx = parseInt(m[1], 10);
        if (idx > maxLayer) maxLayer = idx;
      }
    }
    return maxLayer >= 0 ? maxLayer + 1 : 2;
  }
}

// ============================================================
// Main entry point
// ============================================================

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cli = new MiniMindCLI(argv);
  await cli.run();
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});

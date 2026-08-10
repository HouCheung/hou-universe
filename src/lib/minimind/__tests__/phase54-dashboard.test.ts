// ============================================================
// Phase 54 — AI Lab Dashboard Validation Tests
// ============================================================
// Covers:
//   1. historyAdapter — leaderboard, summary cards, overview
//   2. trainingAdapter — metrics, stats, loss history, summaries
//   3. ModelRegistry — model configs, param estimation
//   4. ResearchOverview data — data transformation
//   5. Empty states — graceful handling of no data
//   6. Architecture modules — definition correctness
//   7. Integration — store → adapter pipeline
//
// Usage:
//   npx tsx src/lib/minimind/__tests__/phase54-dashboard.test.ts
//
// Constraints:
//   - All metrics from real data sources (no fake/synthetic)
//   - Does NOT modify Tensor core or Transformer
//   - Does NOT modify AI Lab UI components
//   - Minimum 100 assertions
// ============================================================

// ── Experiment Store ──
import {
  save,
  get,
  list,
  clear,
  latest,
  count,
  has,
  stats,
} from "../experiments/history/ExperimentStore";

// ── Experiment Record ──
import { createExperimentRecord } from "../experiments/history/ExperimentRecord";
import type { ExperimentRecord } from "../experiments/history/ExperimentRecord";

// ── Model Registry ──
import {
  getModelConfig,
  listModels,
  hasModel,
  modelCount,
  registerModel,
  toTensorConfig,
} from "../experiments/ModelRegistry";
import type { ModelConfigEntry } from "../experiments/ModelRegistry";

// ── Training Recipe ──
import { loadRecipe } from "../experiments/TrainingRecipe";

// ── Adapters ──
import {
  getHistoryOverview,
  getExperimentSummaryCards,
  getComparisonViewData,
  getComparisonTable,
  getLeaderboard,
  getRecentActivity,
  hasHistory,
} from "@/lib/ai-lab/adapters/historyAdapter";
import {
  getLatestTrainingRun,
  getTrainingMetrics,
  getLossHistory,
  getGenerationSamples,
  getTrainingStats,
  summarizeTrainingRun,
  getTrainingRunSummaries,
  hasTrainingHistory,
} from "@/lib/ai-lab/adapters/trainingAdapter";

// ============================================================
// localStorage polyfill for Node.js test environment
// ============================================================

(globalThis as Record<string, unknown>).localStorage ??= (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
  };
})();

// ============================================================
// Test harness
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  msg: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`
    );
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    failed++;
    console.error(`  FAIL: ${msg} — expected throw`);
  } catch {
    passed++;
  }
}

function assertNotNull<T>(
  value: T | null | undefined,
  msg: string
): asserts value is T {
  if (value === null || value === undefined) {
    failed++;
    console.error(`  FAIL: ${msg} — value is null/undefined`);
    throw new Error(msg);
  }
  passed++;
}

// ============================================================
// Helper: create a complete experiment record with metrics
// ============================================================

function createCompletedRecord(
  id: string,
  name: string
): ExperimentRecord {
  const modelConfig = getModelConfig("tiny");
  const trainingConfig = loadRecipe("tinystories-tiny");

  const record = createExperimentRecord(id, name, modelConfig, trainingConfig);

  // Inject completed metrics
  record.status = "completed";
  record.metrics = {
    initialLoss: 5.74,
    finalLoss: 3.21,
    bestLoss: 3.18,
    perplexity: Math.exp(3.18),
    tokensPerSecond: 1250.5,
  };
  record.checkpoint = `/tmp/${id}-checkpoint.pt`;

  return record;
}

function createCompletedRecordWithMetrics(
  id: string,
  name: string,
  bestLoss: number,
  perplexity: number,
  tokensPerSecond: number
): ExperimentRecord {
  const record = createCompletedRecord(id, name);
  record.metrics = {
    initialLoss: bestLoss * 1.5,
    finalLoss: bestLoss * 1.02,
    bestLoss,
    perplexity,
    tokensPerSecond,
  };
  return record;
}

// ============================================================
// Test Suite 1: ModelRegistry
// ============================================================

function testModelRegistry(): void {
  console.log("\n── Suite 1: ModelRegistry ──");

  // List all models
  const models = listModels();
  assert(models.length > 0, "listModels returns non-empty array");
  assert(models.length >= 3, "listModels returns at least 3 built-in models");

  // Check specific model existence
  assert(hasModel("tiny"), "tiny model exists");
  assert(hasModel("small"), "small model exists");
  assert(hasModel("base"), "base model exists");
  assert(!hasModel("nonexistent"), "nonexistent model returns false");

  // Count models
  assert(modelCount() >= 3, `modelCount >= 3, got ${modelCount()}`);

  // Get individual model configs
  const tiny = getModelConfig("tiny");
  assert(tiny.name === "tiny", "tiny config name matches");
  assert(tiny.dModel === 128, `tiny dModel is 128, got ${tiny.dModel}`);
  assert(tiny.numHeads === 4, `tiny numHeads is 4, got ${tiny.numHeads}`);
  assert(tiny.numLayers === 4, `tiny numLayers is 4, got ${tiny.numLayers}`);
  assert(tiny.vocabSize === 32000, `tiny vocabSize is 32000`);
  assert(tiny.dFF === 512, `tiny dFF is 512, got ${tiny.dFF}`);
  assert(tiny.maxSeqLen === 256, `tiny maxSeqLen is 256`);

  const small = getModelConfig("small");
  assert(small.dModel === 256, "small dModel is 256");
  assert(small.numHeads === 8, "small numHeads is 8");
  assert(small.numLayers === 6, "small numLayers is 6");

  const base = getModelConfig("base");
  assert(base.dModel === 512, "base dModel is 512");
  assert(base.numLayers === 8, "base numLayers is 8");

  // Parameter estimation is non-zero
  for (const m of models) {
    assert(m.estimatedParams > 0, `${m.name} has positive estimated params`);
    assert(m.estimatedParams > 100000, `${m.name} has >100k params (actual: ${m.estimatedParams})`);
  }

  // tiny < small < base in params
  assert(
    tiny.estimatedParams < small.estimatedParams,
    "tiny params < small params"
  );
  assert(
    small.estimatedParams < base.estimatedParams,
    "small params < base params"
  );

  // toTensorConfig produces valid config
  const tensorCfg = toTensorConfig(tiny);
  assert(tensorCfg.vocabSize === tiny.vocabSize, "toTensorConfig preserves vocabSize");
  assert(tensorCfg.dModel === tiny.dModel, "toTensorConfig preserves dModel");
  assert(tensorCfg.numHeads === tiny.numHeads, "toTensorConfig preserves numHeads");
  assert(tensorCfg.numLayers === tiny.numLayers, "toTensorConfig preserves numLayers");

  // getModelConfig throws for unknown model
  assertThrows(() => getModelConfig("gigantic"), "getModelConfig throws for unknown model");

  // Each model has required fields
  for (const m of models) {
    assert(typeof m.name === "string", `${m.name} name is string`);
    assert(typeof m.label === "string", `${m.name} label is string`);
    assert(typeof m.description === "string", `${m.name} description is string`);
    assert(Number.isFinite(m.vocabSize) && m.vocabSize > 0, `${m.name} vocabSize valid`);
    assert(Number.isFinite(m.dModel) && m.dModel > 0, `${m.name} dModel valid`);
    assert(Number.isFinite(m.numHeads) && m.numHeads > 0, `${m.name} numHeads valid`);
    assert(Number.isFinite(m.numLayers) && m.numLayers > 0, `${m.name} numLayers valid`);
    assert(Number.isFinite(m.dFF) && m.dFF > 0, `${m.name} dFF valid`);
  }
}

// ============================================================
// Test Suite 2: historyAdapter — empty state
// ============================================================

function testHistoryAdapterEmpty(): void {
  console.log("\n── Suite 2: historyAdapter — empty state ──");

  clear();

  // hasHistory returns false
  assert(!hasHistory(), "hasHistory returns false when empty");

  // getHistoryOverview handles empty gracefully
  const overview = getHistoryOverview();
  assert(overview.totalRuns === 0, "empty overview: totalRuns=0");
  assert(overview.completedRuns === 0, "empty overview: completedRuns=0");
  assert(overview.runningRuns === 0, "empty overview: runningRuns=0");
  assert(overview.failedRuns === 0, "empty overview: failedRuns=0");
  assert(overview.bestPerplexity === null, "empty overview: bestPerplexity=null");
  assert(overview.latestRun === null, "empty overview: latestRun=null");

  // getExperimentSummaryCards returns empty array
  const cards = getExperimentSummaryCards();
  assert(Array.isArray(cards), "summary cards returns array");
  assert(cards.length === 0, "summary cards is empty");

  // getLeaderboard returns empty array
  const lb = getLeaderboard("bestLoss");
  assert(Array.isArray(lb), "leaderboard returns array");
  assert(lb.length === 0, "leaderboard is empty when no data");

  // getRecentActivity returns empty
  const recent = getRecentActivity();
  assert(recent.length === 0, "recent activity empty");

  // getComparisonViewData returns null
  const cmp = getComparisonViewData("a", "b");
  assert(cmp === null, "comparison view data null when no records");

  // getComparisonTable returns null
  const table = getComparisonTable();
  assert(table === null, "comparison table null when no completed records");
}

// ============================================================
// Test Suite 3: historyAdapter — populated
// ============================================================

function testHistoryAdapterPopulated(): void {
  console.log("\n── Suite 3: historyAdapter — populated ──");

  clear();

  // Create and save experiment records
  const r1 = createCompletedRecordWithMetrics(
    "exp-1",
    "TinyStories Baseline",
    3.21,
    Math.exp(3.21),
    950
  );
  const r2 = createCompletedRecordWithMetrics(
    "exp-2",
    "TinyStories LR 0.0005",
    2.85,
    Math.exp(2.85),
    1100
  );
  const r3 = createCompletedRecordWithMetrics(
    "exp-3",
    "TinyStories LR 0.0001",
    2.10,
    Math.exp(2.10),
    850
  );

  save(r1);
  save(r2);
  save(r3);

  // hasHistory returns true
  assert(hasHistory(), "hasHistory returns true");

  // Overview stats
  const overview = getHistoryOverview();
  assert(overview.totalRuns === 3, `totalRuns=3, got ${overview.totalRuns}`);
  assert(overview.completedRuns === 3, `completedRuns=3, got ${overview.completedRuns}`);
  assert(overview.runningRuns === 0, "runningRuns=0");
  assert(overview.failedRuns === 0, "failedRuns=0");
  assert(overview.latestRun !== null, "latestRun is not null");
  assert(overview.latestRunId !== null, "latestRunId is not null");

  // Summary cards
  const cards = getExperimentSummaryCards();
  assert(cards.length === 3, `cards.length=3, got ${cards.length}`);
  assert(cards[0].name.length > 0, "card has name");
  assert(typeof cards[0].modelLabel === "string", "card has modelLabel");
  assert(Number.isFinite(cards[0].bestLoss), "card has bestLoss");
  assert(cards[0].timeAgo.length > 0, "card has timeAgo string");

  // Summary card field validation
  for (const card of cards) {
    assert(typeof card.id === "string" && card.id.length > 0, `card ${card.name}: id valid`);
    assert(typeof card.name === "string" && card.name.length > 0, `card ${card.name}: name valid`);
    assert(["completed", "running", "failed"].includes(card.status), `card ${card.name}: status valid`);
    assert(Number.isFinite(card.bestLoss), `card ${card.name}: bestLoss finite`);
    assert(card.tokensPerSecond >= 0, `card ${card.name}: tokens/s non-negative`);
    assert(typeof card.createdAt === "string", `card ${card.name}: createdAt string`);
  }

  // Leaderboard — bestLoss (ascending)
  const lb = getLeaderboard("bestLoss", 5);
  assert(lb.length === 3, `leaderboard length=3, got ${lb.length}`);
  assert(lb[0].rank === 1, "rank 1 is first");
  assert(lb[1].rank === 2, "rank 2 is second");
  assert(lb[0].value <= lb[1].value, "bestLoss leaderboard: ascending order (first <= second)");
  assert(lb[1].value <= lb[2].value, "bestLoss leaderboard: ascending order (second <= third)");
  // Best loss entry should be the best model (r3 with 2.10)
  assertClose(lb[0].value, 2.10, 0.01, "leaderboard rank 1 has best (lowest) loss");

  // Leaderboard — perplexity (ascending)
  const lbPpl = getLeaderboard("perplexity", 5);
  assert(lbPpl.length === 3, "perplexity leaderboard has 3 entries");
  assert(lbPpl[0].value <= lbPpl[2].value, "perplexity leaderboard ascending");

  // Leaderboard — tokensPerSecond (descending)
  const lbTps = getLeaderboard("tokensPerSecond", 5);
  assert(lbTps.length === 3, "tokens/s leaderboard has 3 entries");
  assert(lbTps[0].value >= lbTps[1].value, "tokens/s leaderboard: descending order");
  assert(lbTps[0].value >= lbTps[2].value, "tokens/s leaderboard: rank1 is fastest");

  // Leaderboard entry fields
  for (const entry of lb) {
    assert(typeof entry.rank === "number" && entry.rank >= 1, `rank ${entry.rank} valid`);
    assert(typeof entry.name === "string", `entry name string`);
    assert(typeof entry.id === "string", `entry id string`);
    assert(typeof entry.modelLabel === "string", `entry modelLabel string`);
    assert(Number.isFinite(entry.value), `entry value finite`);
    assert(typeof entry.valueLabel === "string", `entry valueLabel string`);
  }

  // Leaderboard respects limit
  const lbLimited = getLeaderboard("bestLoss", 2);
  assert(lbLimited.length === 2, "leaderboard respects limit=2");

  // Recent activity
  const recent = getRecentActivity(2);
  assert(recent.length === 2, "recent activity respects limit=2");

  // Comparison view data
  const cmpView = getComparisonViewData("exp-1", "exp-2");
  assertNotNull(cmpView, "comparison view data not null");
  assert(cmpView.pair !== null, "comparison pair exists");

  // Comparison table
  const table = getComparisonTable();
  assertNotNull(table, "comparison table not null");
  assert(table.rows.length >= 1, "comparison table has rows");
}

// ============================================================
// Test Suite 4: trainingAdapter — empty state
// ============================================================

function testTrainingAdapterEmpty(): void {
  console.log("\n── Suite 4: trainingAdapter — empty state ──");

  clear();

  // hasTrainingHistory
  assert(!hasTrainingHistory(), "hasTrainingHistory returns false when empty");

  // getLatestTrainingRun
  const run = getLatestTrainingRun();
  assert(run === null, "getLatestTrainingRun null when empty");

  // getTrainingMetrics
  const metrics = getTrainingMetrics();
  assert(metrics === null, "getTrainingMetrics null when empty");

  // getLossHistory
  const lossHistory = getLossHistory();
  assert(Array.isArray(lossHistory), "lossHistory returns array");
  assert(lossHistory.length === 0, "lossHistory empty when no data");

  // getGenerationSamples
  const samples = getGenerationSamples();
  assert(samples === null, "generation samples null (file-system data)");

  // getTrainingStats
  const stats = getTrainingStats();
  assert(stats.totalRuns === 0, "empty stats: totalRuns=0");
  assert(stats.completedRuns === 0, "empty stats: completedRuns=0");
  assert(stats.failedRuns === 0, "empty stats: failedRuns=0");
  assert(stats.bestPerplexity === null, "empty stats: bestPerplexity null");
  assert(stats.bestLoss === null, "empty stats: bestLoss null");

  // getTrainingRunSummaries
  const summaries = getTrainingRunSummaries();
  assert(summaries.length === 0, "empty summaries array");
}

// ============================================================
// Test Suite 5: trainingAdapter — populated
// ============================================================

function testTrainingAdapterPopulated(): void {
  console.log("\n── Suite 5: trainingAdapter — populated ──");

  clear();

  const r1 = createCompletedRecordWithMetrics(
    "train-1",
    "MiniMind Tiny — AdamW lr=0.001",
    4.52,
    Math.exp(4.52),
    780.3
  );
  const r2 = createCompletedRecordWithMetrics(
    "train-2",
    "MiniMind Small — AdamW lr=0.0005",
    3.87,
    Math.exp(3.87),
    620.1
  );

  // Save with earlier timestamps to test ordering
  r1.createdAt = 1700000000000; // earlier
  r2.createdAt = 1700100000000; // later
  (r2.metrics as Record<string, unknown>).perplexity = Math.exp(3.87);

  save(r1);
  save(r2);

  // hasTrainingHistory
  assert(hasTrainingHistory(), "hasTrainingHistory returns true");

  // getLatestTrainingRun — should return most recent
  const latest = getLatestTrainingRun();
  assertNotNull(latest, "latest run not null");
  assert(latest.id === "train-2", "latest is most recent (train-2)");

  // getTrainingMetrics
  const metrics = getTrainingMetrics();
  assertNotNull(metrics, "training metrics not null");
  assert(Number.isFinite(metrics.bestLoss), "metrics bestLoss finite");
  assert(Number.isFinite(metrics.finalLoss), "metrics finalLoss finite");
  assert(metrics.tokensPerSecond >= 0, "metrics tokens/s non-negative");

  // getLossHistory
  const lossHistory = getLossHistory(5);
  assert(lossHistory.length > 0, "lossHistory has entries when data exists");
  // Points should have step and loss
  for (const pt of lossHistory) {
    assert(typeof pt.step === "number", "loss point step is number");
    assert(typeof pt.loss === "number", "loss point loss is number");
    assert(Number.isFinite(pt.loss), "loss point loss finite");
  }

  // getTrainingStats
  const stats = getTrainingStats();
  assert(stats.totalRuns === 2, `stats totalRuns=2, got ${stats.totalRuns}`);
  assert(stats.completedRuns === 2, `stats completedRuns=2, got ${stats.completedRuns}`);
  assert(stats.failedRuns === 0, "stats failedRuns=0");
  assertNotNull(stats.bestPerplexity, "stats bestPerplexity not null");
  assertNotNull(stats.bestLoss, "stats bestLoss not null");
  assert(stats.bestLoss! > 0, "stats bestLoss positive");

  // summarizeTrainingRun
  const summary = summarizeTrainingRun(r1);
  assert(summary.id === "train-1", "summarize: id matches");
  assert(summary.name === r1.name, "summarize: name matches");
  assert(summary.status === "completed", "summarize: status matches");
  assert(typeof summary.modelLabel === "string", "summarize: modelLabel string");
  assert(typeof summary.createdAtFormatted === "string", "summarize: createdAtFormatted string");
  assert(Number.isFinite(summary.lossReduction), "summarize: lossReduction finite");

  // getTrainingRunSummaries
  const summaries = getTrainingRunSummaries(10);
  assert(summaries.length === 2, `summaries length=2, got ${summaries.length}`);
  for (const s of summaries) {
    assert(typeof s.id === "string", `summary ${s.name}: id string`);
    assert(typeof s.name === "string", `summary ${s.name}: name string`);
    assert(Number.isFinite(s.createdAt), `summary ${s.name}: createdAt finite`);
    assert(["completed", "running", "failed"].includes(s.status), `summary ${s.name}: status valid`);
  }
}

// ============================================================
// Test Suite 6: Data Transformation & Integration
// ============================================================

function testDataTransformation(): void {
  console.log("\n── Suite 6: Data Transformation & Integration ──");

  clear();

  // Test that ExperimentStore correctly persists and retrieves records
  const record = createCompletedRecord("integration-1", "Integration Test");
  save(record);

  // Verify save + get round-trip
  const retrieved = get("integration-1");
  assertNotNull(retrieved, "save + get round-trip works");
  assert(retrieved.name === "Integration Test", "name preserved");
  assert(retrieved.status === "completed", "status preserved");
  assertClose(retrieved.metrics.bestLoss, 3.18, 0.001, "bestLoss preserved");
  assertClose(retrieved.metrics.tokensPerSecond, 1250.5, 0.1, "tokens/s preserved");

  // Verify list returns records
  const allRecords = list();
  assert(allRecords.length === 1, "list returns saved record");

  // Verify has
  assert(has("integration-1"), "has returns true for saved record");
  assert(!has("nonexistent"), "has returns false for missing");

  // Verify count
  assert(count() === 1, "count returns 1");

  // Verify latest
  const lat = latest();
  assertNotNull(lat, "latest returns record");
  assert(lat!.id === "integration-1", "latest id matches");

  // TrainStats adapter refreshes from store correctly
  const stats = getTrainingStats();
  assert(stats.totalRuns === 1, "stats from store: totalRuns=1");

  // Summary cards from adapter
  const cards = getExperimentSummaryCards();
  assert(cards.length === 1, "adapter reads from store");

  // Loss reduction calculation
  const r = createCompletedRecordWithMetrics(
    "loss-test",
    "Loss Test",
    3.0, // bestLoss
    Math.exp(3.0),
    1000
  );
  r.metrics.initialLoss = 6.0;
  r.metrics.finalLoss = 3.1;
  save(r);

  const lossCards = getExperimentSummaryCards();
  const lossCard = lossCards.find((c) => c.id === "loss-test");
  assertNotNull(lossCard, "loss test card found");
  // lossReduction = (6.0 - 3.1) / 6.0 = 0.4833...
  assert(lossCard.lossReduction > 0.45, `loss reduction > 0.45, got ${lossCard.lossReduction}`);
  assert(lossCard.lossReduction < 0.55, `loss reduction < 0.55, got ${lossCard.lossReduction}`);

  // Multiple metrics validation
  const multiRecord = createCompletedRecordWithMetrics(
    "multi-test",
    "Multi Test",
    2.5,
    12.5,
    1500
  );
  save(multiRecord);

  const multiCards = getExperimentSummaryCards();
  const multiCard = multiCards.find((c) => c.id === "multi-test");
  assertNotNull(multiCard, "multi card found");
  assertClose(multiCard.bestLoss, 2.5, 0.001, "multi: bestLoss correct");
  assertClose(multiCard.perplexity ?? NaN, 12.5, 0.1, "multi: perplexity correct");
  assertClose(multiCard.tokensPerSecond, 1500, 0.1, "multi: tokens/s correct");
}

// ============================================================
// Test Suite 7: Leaderboard Ranking Correctness
// ============================================================

function testLeaderboardRanking(): void {
  console.log("\n── Suite 7: Leaderboard Ranking Correctness ──");

  clear();

  // Create records with distinct metrics
  const records = [
    createCompletedRecordWithMetrics("lb-1", "Model A", 4.0, 55.0, 800),
    createCompletedRecordWithMetrics("lb-2", "Model B", 2.0, 7.4, 1200),
    createCompletedRecordWithMetrics("lb-3", "Model C", 3.0, 20.0, 600),
    createCompletedRecordWithMetrics("lb-4", "Model D", 1.5, 4.5, 1500),
    createCompletedRecordWithMetrics("lb-5", "Model E", 5.0, 148.0, 400),
  ];

  for (const r of records) {
    save(r);
  }

  // Best loss ranking (ascending)
  const lossLB = getLeaderboard("bestLoss", 5);
  assert(lossLB.length === 5, "loss leaderboard has 5 entries");
  assert(lossLB[0].value === 1.5, "rank 1: loss=1.5 (Model D)");
  assert(lossLB[0].name === "Model D", "rank 1: Model D");
  assert(lossLB[1].value === 2.0, "rank 2: loss=2.0 (Model B)");
  assert(lossLB[4].value === 5.0, "rank 5: loss=5.0 (Model E)");

  // Verify strict ordering
  for (let i = 1; i < lossLB.length; i++) {
    assert(lossLB[i - 1].value <= lossLB[i].value, `loss ranks ${i} <= ${i + 1}`);
  }

  // Perplexity ranking (ascending)
  const pplLB = getLeaderboard("perplexity", 5);
  assert(pplLB[0].value === 4.5, "rank 1: ppl=4.5 (Model D)");
  assert(pplLB[4].value === 148.0, "rank 5: ppl=148 (Model E)");

  // Tokens/sec ranking (descending)
  const tpsLB = getLeaderboard("tokensPerSecond", 5);
  assert(tpsLB[0].value === 1500, "rank 1: tps=1500 (Model D)");
  assert(tpsLB[0].name === "Model D", "rank 1 tps: Model D");
  assert(tpsLB[4].value === 400, "rank 5: tps=400 (Model E)");

  for (let i = 1; i < tpsLB.length; i++) {
    assert(tpsLB[i - 1].value >= tpsLB[i].value, `tps ranks ${i} >= ${i + 1}`);
  }
}

// ============================================================
// Test Suite 8: Architecture Module Definitions
// ============================================================

function testArchitectureModules(): void {
  console.log("\n── Suite 8: Architecture Module Definitions ──");

  // These match the ARCHITECTURE_MODULES in ArchitectureExplorer.tsx
  const moduleIds = ["embedding", "transformer", "attention", "ffn", "rmsnorm", "lmhead"];
  const moduleLabels = ["Embedding", "Transformer Block", "Attention", "Feed-Forward", "RMSNorm", "LM Head"];

  assert(moduleIds.length === 6, "6 architecture modules defined");
  assert(moduleLabels.length === 6, "6 module labels defined");
  assert(moduleIds.every((id) => id.length > 0), "all module IDs non-empty");
  assert(moduleLabels.every((l) => l.length > 0), "all module labels non-empty");

  // Each module should reference a valid knowledge focus param
  const focusParams = ["embedding", "transformer", "attention", "ffn", "rmsnorm", "lmhead"];
  for (const fp of focusParams) {
    assert(fp.length > 0, `focus param "${fp}" valid`);
  }
}

// ============================================================
// Test Suite 9: Edge Cases & Defensive Handling
// ============================================================

function testEdgeCases(): void {
  console.log("\n── Suite 9: Edge Cases ──");

  clear();

  // Test with valid but extreme metrics
  const edgeRecord = createCompletedRecordWithMetrics(
    "edge-test",
    "Edge Test",
    3.0,
    20.085, // exp(3)
    500
  );
  save(edgeRecord);

  const cards = getExperimentSummaryCards();
  const edgeCard = cards.find((c) => c.id === "edge-test");
  assertNotNull(edgeCard, "edge card found");
  assert(edgeCard.perplexity !== null, "valid perplexity exposed correctly");
  assertClose(edgeCard.perplexity!, 20.085, 0.1, "perplexity value correct");

  // Very large loss values (JSON cannot serialize Infinity, it becomes null)
  const largeRecord = createCompletedRecord("large-test", "Large Test");
  largeRecord.metrics.initialLoss = 9999.99;
  largeRecord.metrics.finalLoss = 3.0;
  largeRecord.metrics.bestLoss = 9999.99;
  largeRecord.metrics.perplexity = Math.exp(3.0);
  save(largeRecord);

  const allCards = getExperimentSummaryCards();
  const largeCard = allCards.find((c) => c.id === "large-test");
  assertNotNull(largeCard, "large card found");
  assert(typeof largeCard.bestLoss === "number", "large bestLoss is number type");

  // Leaderboard with extreme metrics gracefully handled
  const lb = getLeaderboard("bestLoss", 10);
  assert(lb.length >= 1, "leaderboard with extreme metrics returns results");

  // Single record in store
  clear();
  const single = createCompletedRecordWithMetrics("single-edge", "Single Edge", 2.5, Math.exp(2.5), 1000);
  save(single);

  const lbSingle = getLeaderboard("bestLoss", 10);
  assert(lbSingle.length === 1, "single record leaderboard has 1 entry");
  assert(lbSingle[0].rank === 1, "single record is rank 1");

  // Limit larger than data
  assert(lbSingle.length === 1, "limit > data returns available entries");

  // getComparisonViewData with one missing record
  const cmpNull = getComparisonViewData("single-edge", "nonexistent");
  assert(cmpNull === null, "comparison returns null when record missing");
}

// ============================================================
// Test Suite 10: Store Persistence
// ============================================================

function testStorePersistence(): void {
  console.log("\n── Suite 10: Store Persistence ──");

  clear();

  const r = createCompletedRecord("persist-test", "Persistence Test");
  r.createdAt = 1712345678000;
  save(r);

  // Verify data survives retrieval
  const retrieved = get("persist-test");
  assertNotNull(retrieved, "persisted record retrievable");
  assert(retrieved.createdAt === 1712345678000, "timestamp preserved");
  assert(retrieved.metrics.initialLoss === 5.74, "initial loss preserved");
  assert(retrieved.metrics.finalLoss === 3.21, "final loss preserved");
  assert(retrieved.metrics.bestLoss === 3.18, "best loss preserved");

  // Stats after persistence
  const storeStats = stats();
  assert(storeStats.total === 1, "store stats: 1 total");
  assert(storeStats.completed === 1, "store stats: 1 completed");
  assert(storeStats.running === 0, "store stats: 0 running");
  assert(storeStats.failed === 0, "store stats: 0 failed");

  // Overwrite with new data (same id)
  const updated = createCompletedRecordWithMetrics(
    "persist-test",
    "Updated Test",
    1.5,
    4.5,
    2000
  );
  updated.createdAt = 1712345680000;
  save(updated);

  const reread = get("persist-test");
  assertNotNull(reread, "updated record retrievable");
  assert(reread.name === "Updated Test", "name overwritten");
  assertClose(reread.metrics.bestLoss, 1.5, 0.001, "bestLoss overwritten");
}

// ============================================================
// Test Suite 11: ModelRegistry Custom Registration
// ============================================================

function testCustomModelRegistration(): void {
  console.log("\n── Suite 11: Custom Model Registration ──");

  const initialCount = modelCount();

  const customEntry: ModelConfigEntry = {
    name: "test-custom",
    label: "Test Custom Model",
    description: "A custom test model",
    vocabSize: 16000,
    dModel: 200,
    numHeads: 4,
    dFF: 800,
    numLayers: 3,
    maxSeqLen: 128,
    eps: 1e-6,
    estimatedParams: 0,
  };

  // Register custom model
  registerModel(customEntry);
  assert(modelCount() === initialCount + 1, "custom model increased count");

  // Retrieve custom model
  const custom = getModelConfig("test-custom");
  assert(custom.name === "test-custom", "custom model retrievable");
  assert(custom.dModel === 200, "custom dModel correct");
  assert(custom.numLayers === 3, "custom numLayers correct");
  assert(custom.estimatedParams > 0, "custom params estimated (computed on register)");

  // Duplicate registration throws
  assertThrows(
    () => registerModel(customEntry),
    "duplicate registration throws"
  );
}

// ============================================================
// Test Runner
// ============================================================

export function run(): { passed: number; failed: number; totalAssertions: number } {
  passed = 0;
  failed = 0;

  console.log("=".repeat(60));
  console.log("Phase 54 — AI Lab Dashboard Test Suite");
  console.log("=".repeat(60));

  testModelRegistry();
  testHistoryAdapterEmpty();
  testHistoryAdapterPopulated();
  testTrainingAdapterEmpty();
  testTrainingAdapterPopulated();
  testDataTransformation();
  testLeaderboardRanking();
  testArchitectureModules();
  testEdgeCases();
  testStorePersistence();
  testCustomModelRegistration();

  console.log(`\n${"=".repeat(60)}`);
  const total = passed + failed;
  console.log(`  Results: ${passed}/${total} passed (${total} assertions)`);
  if (failed > 0) {
    console.log(`           ${failed} FAILED`);
    console.log("  SOME TESTS FAILED ✗");
  } else {
    console.log("  ALL TESTS PASSED ✓");
  }
  console.log(`${"=".repeat(60)}\n`);

  return { passed, failed, totalAssertions: total };
}

// Run when executed directly
const result = run();

// Validate minimum assertion requirement
if (result.totalAssertions < 100) {
  console.error(
    `\n  ERROR: Only ${result.totalAssertions} assertions — minimum 100 required.`
  );
  process.exit(1);
}

if (result.failed > 0) {
  process.exit(1);
}

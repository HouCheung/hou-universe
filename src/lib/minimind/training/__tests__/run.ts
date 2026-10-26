// ============================================================
// Test runner for MiniMind Training Module (Phase 41 + 42)
// ============================================================
// Run with: npx tsx src/lib/minimind/training/__tests__/run.ts
// ============================================================

import { runTrainerTests } from "./trainer.test";
import { runCheckpointTests } from "./checkpoint.test";
import { runEvaluatorTests } from "./evaluator.test";
import { runExperimentRunnerTests } from "./experiment.test";
import { runResumeTests } from "./resume.test";

let totalPassed = 0;
let totalFailed = 0;

console.log("=".repeat(60));
console.log("MiniMind Training Module — Test Suite (Phase 41-48)");
console.log("=".repeat(60));

// Phase 41: Trainer
const trainerResult = runTrainerTests();
totalPassed += trainerResult.passed;
totalFailed += trainerResult.failed;

// Phase 42: Checkpoint
const checkpointResult = runCheckpointTests();
totalPassed += checkpointResult.passed;
totalFailed += checkpointResult.failed;

// Phase 42: Evaluator
const evaluatorResult = runEvaluatorTests();
totalPassed += evaluatorResult.passed;
totalFailed += evaluatorResult.failed;

// Phase 42: Experiment Runner
const experimentResult = runExperimentRunnerTests();
totalPassed += experimentResult.passed;
totalFailed += experimentResult.failed;

// Phase 48: Resume
const resumeResult = runResumeTests();
totalPassed += resumeResult.passed;
totalFailed += resumeResult.failed;

console.log("\n" + "=".repeat(60));
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log("=".repeat(60));

if (totalFailed > 0) {
  process.exit(1);
}

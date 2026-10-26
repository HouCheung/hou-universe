// ============================================================
// Phase 50 combined test runner
// ============================================================
// Runs all Phase 50 validation tests:
//   - ModelRegistry (50 tests)
//   - TrainingRecipe (62 tests)
//   - BenchmarkRunner (50 tests)
//   - Ablation (44 tests)
//   - ModelStats (50 tests)
// ============================================================

import { runModelRegistryTests } from "../experiments/__tests__/ModelRegistry.test";
import { runTrainingRecipeTests } from "../experiments/__tests__/TrainingRecipe.test";
import { runBenchmarkRunnerTests } from "../evaluation/__tests__/BenchmarkRunner.test";
import { runAblationTests } from "../experiments/__tests__/Ablation.test";
import { runModelStatsTests } from "../evaluation/__tests__/ModelStats.test";

export function runPhase50Tests(): { passed: number; failed: number; total: number } {
  console.log("=".repeat(60));
  console.log("Phase 50 — MiniMind Framework Validation Tests");
  console.log("=".repeat(60));

  const results = [
    runModelRegistryTests(),
    runTrainingRecipeTests(),
    runBenchmarkRunnerTests(),
    runAblationTests(),
    runModelStatsTests(),
  ];

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const totalTests = totalPassed + totalFailed;

  console.log("=".repeat(60));
  console.log("Phase 50 Test Summary:");
  console.log(`  ModelRegistry:    ${results[0].passed} passed, ${results[0].failed} failed`);
  console.log(`  TrainingRecipe:   ${results[1].passed} passed, ${results[1].failed} failed`);
  console.log(`  BenchmarkRunner:  ${results[2].passed} passed, ${results[2].failed} failed`);
  console.log(`  Ablation:         ${results[3].passed} passed, ${results[3].failed} failed`);
  console.log(`  ModelStats:       ${results[4].passed} passed, ${results[4].failed} failed`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL:            ${totalPassed} passed, ${totalFailed} failed (${totalTests} tests)`);
  console.log("=".repeat(60));

  return { passed: totalPassed, failed: totalFailed, total: totalTests };
}

// Allow running directly
if (require.main === module) {
  const result = runPhase50Tests();
  if (result.failed > 0) {
    process.exit(1);
  }
  console.log(`\nAll ${result.total} tests passed!`);
}

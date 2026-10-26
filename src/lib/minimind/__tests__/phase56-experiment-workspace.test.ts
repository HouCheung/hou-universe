// ============================================================
// Phase 56 combined test runner
// ============================================================
// Runs all Phase 56 experiment workspace tests:
//   - experimentLauncherAdapter (50 tests)
//   - launcherConfigValidation (50 tests)
//   - workspace integration tests (25 tests)
// ============================================================

import { runExperimentLauncherAdapterTests } from "../../ai-lab/adapters/__tests__/experimentLauncherAdapter.test";
import { runLauncherConfigValidationTests } from "../../ai-lab/adapters/__tests__/launcherConfigValidation.test";
import { runWorkspaceIntegrationTests } from "./phase56-workspace-integration.test";

export function runPhase56Tests(): {
  passed: number;
  failed: number;
  total: number;
} {
  console.log("=".repeat(60));
  console.log("Phase 56 — MiniMind Experiment Workspace Tests");
  console.log("=".repeat(60));

  const results = [
    runExperimentLauncherAdapterTests(),
    runLauncherConfigValidationTests(),
    runWorkspaceIntegrationTests(),
  ];

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const totalTests = totalPassed + totalFailed;

  console.log("=".repeat(60));
  console.log("Phase 56 Test Summary:");
  console.log(
    `  Adapter:              ${results[0].passed} passed, ${results[0].failed} failed`
  );
  console.log(
    `  Config Validation:    ${results[1].passed} passed, ${results[1].failed} failed`
  );
  console.log(
    `  Workspace Integration: ${results[2].passed} passed, ${results[2].failed} failed`
  );
  console.log(`  ─────────────────────────────`);
  console.log(
    `  TOTAL:                ${totalPassed} passed, ${totalFailed} failed (${totalTests} tests)`
  );
  console.log("=".repeat(60));

  return { passed: totalPassed, failed: totalFailed, total: totalTests };
}

// Allow running directly
if (typeof require !== "undefined" && require.main === module) {
  const result = runPhase56Tests();
  if (result.failed > 0) {
    process.exit(1);
  }
  console.log(`\nAll ${result.total} tests passed!`);
}

// ============================================================
// Test runner for MiniMind Research Module (Phase 57-87)
// ============================================================
// Run with: npx tsx src/lib/minimind/research/__tests__/run.ts
// ============================================================

import { runPhase57Tests } from "./phase57-research.test";
import { runPhase58Tests } from "./phase58-runtime.test";
import { runPhase59Tests } from "../copilot/__tests__/phase59-copilot.test";
import { runPhase61Tests } from "./phase61-e2e.test";
import { runPhase61CheckpointResumeTests } from "./phase61-checkpoint-resume.test";
import { runPhase63Tests } from "./phase63-study.test";
import { runPhase65Tests, runPhase65AsyncTests } from "./phase65-real-training.test";
import { runPhase66Tests, runPhase66AsyncTests } from "./phase66-lifecycle.test";
import { runPhase67IdentityTests } from "./phase67-identity.test";
import { runPhase75Tests, runPhase75AsyncTests } from "./phase75-experiments-launch.test";
import { runPhase80Tests } from "./phase80-bilingual.test";
import { runPhase81Tests } from "./phase81-dataset-contract.test";
import { runPhase82Tests } from "./phase82-dataset.test";
import { runPhase83Tests } from "./phase83-config.test";
import { runPhase84Tests, runPhase84AsyncTests } from "./phase84-capability.test";
import { runPhase85Tests, runPhase85AsyncTests } from "./phase85-checkpoint-store.test";
import { runPhase86Tests, runPhase86AsyncTests } from "./phase86-dataset-training.test";
import { runPhase87Tests, runPhase87AsyncTests } from "./phase87-recipe-sweep.test";
import { runPhase88Tests } from "../tests/phase88-alignment.test";
import { runPhase89Tests } from "../tests/phase89-training-alignment.test";
import { runPhase90Tests } from "../tests/phase90-sequence-alignment.test";
import { runPhase91Tests } from "../tests/phase91-generation-audit.test";
import { runPhase92Tests } from "../tests/phase92-tokenizer-budget.test";
import { runPhase93Tests } from "../tests/phase93-capacity-sweep.test";
import { runPhase94Tests } from "../tests/phase94-rollout-objective.test";
import { runPhase95Tests } from "../tests/phase95-instrument-repair.test";
import { runPhase96Tests } from "../tests/phase96-transfer-experiment.test";
import { runPhase97Tests } from "../tests/phase97-position-alignment.test";
import { runPhase98Tests } from "../tests/phase98-cjk-byte-corruption.test";
import { runPhase99Tests } from "../tests/phase99-logit-mechanism.test";
import { runPhase100Tests } from "../tests/phase100-opening-token.test";
import { runPhase101Tests } from "../tests/phase101-utf8-phase-mask.test";
import { runPhase102Tests } from "../tests/phase102-p0-phase-mask.test";
import { runPhase103Tests } from "../tests/phase103-phase-symmetry.test";
import { runPhase104Tests } from "../tests/phase104-preceding-boundary.test";
import { runPhase105Tests } from "../tests/phase105-lead-conditioned.test";
import { runPhase106Tests } from "../tests/phase106-top-lead-conditioning.test";
import { runPhase107Tests } from "../tests/phase107-s0-mass-separation.test";
import { runPhase108Tests } from "../tests/phase108-gap-matched.test";
import { runPhase109Tests } from "../tests/phase109-single-state-robustness.test";
import { runPhase110Tests } from "../tests/phase110-failure-population.test";
import { runPhase113Tests } from "../tests/phase113-chat-sft.test";

async function main(): Promise<void> {
  let totalPassed = 0;
  let totalFailed = 0;

  console.log("=".repeat(60));
  console.log("MiniMind Research Module — Test Suite (Phase 57-87)");
  console.log("=".repeat(60));

  // Phase 57: Research Workspace, Controller Lifecycle & Event Bus
  const phase57Result = await runPhase57Tests();
  totalPassed += phase57Result.passed;
  totalFailed += phase57Result.failed;

  // Phase 58: Live Training Runtime
  const phase58Result = runPhase58Tests();
  totalPassed += phase58Result.passed;
  totalFailed += phase58Result.failed;

  // Phase 59: Research Copilot
  const phase59Result = runPhase59Tests();
  totalPassed += phase59Result.passed;
  totalFailed += phase59Result.failed;

  // Phase 61: End-to-End Integration
  const phase61Result = await runPhase61Tests();
  totalPassed += phase61Result.passed;
  totalFailed += phase61Result.failed;

  // Phase 61: Checkpoint/Resume Integration
  const phase61CheckpointResult = runPhase61CheckpointResumeTests();
  totalPassed += phase61CheckpointResult.passed;
  totalFailed += phase61CheckpointResult.failed;

  // Phase 63: Research Study — Gradient Clipping Experiment
  const phase63Result = await runPhase63Tests();
  totalPassed += phase63Result.passed;
  totalFailed += phase63Result.failed;

  // Phase 65: Real Training via Worker
  const phase65SyncResult = runPhase65Tests();
  totalPassed += phase65SyncResult.passed;
  totalFailed += phase65SyncResult.failed;

  const phase65AsyncResult = await runPhase65AsyncTests();
  totalPassed += phase65AsyncResult.passed;
  totalFailed += phase65AsyncResult.failed;

  // Phase 66: Training Lifecycle & Checkpoint Control
  const phase66SyncResult = runPhase66Tests();
  totalPassed += phase66SyncResult.passed;
  totalFailed += phase66SyncResult.failed;

  const phase66AsyncResult = await runPhase66AsyncTests();
  totalPassed += phase66AsyncResult.passed;
  totalFailed += phase66AsyncResult.failed;

  // Phase 67.5: Identity Model Audit & Unification
  const phase67IdentityResult = runPhase67IdentityTests();
  totalPassed += phase67IdentityResult.passed;
  totalFailed += phase67IdentityResult.failed;

  // Phase 75 / P1 #5: Experiments → Real Training Integration
  const phase75SyncResult = runPhase75Tests();
  totalPassed += phase75SyncResult.passed;
  totalFailed += phase75SyncResult.failed;

  const phase75AsyncResult = await runPhase75AsyncTests();
  totalPassed += phase75AsyncResult.passed;
  totalFailed += phase75AsyncResult.failed;

  // Phase 80: Bilingual Foundation — config/dataset/tokenizer/capability/checkpoint
  const phase80Result = runPhase80Tests();
  totalPassed += phase80Result.passed;
  totalFailed += phase80Result.failed;

  // Phase 81: Dataset Contract Identity — bilingual is the single production dataset
  const phase81Result = runPhase81Tests();
  totalPassed += phase81Result.passed;
  totalFailed += phase81Result.failed;

  // Phase 82: Production Bilingual Dataset System — loader/versioning/checkpoint
  const phase82Result = runPhase82Tests();
  totalPassed += phase82Result.passed;
  totalFailed += phase82Result.failed;

  // Phase 83: Production Model Configuration & Scaling Audit
  const phase83Result = runPhase83Tests();
  totalPassed += phase83Result.passed;
  totalFailed += phase83Result.failed;

  // Phase 84: Real Bilingual Training Capability Validation
  const phase84SyncResult = runPhase84Tests();
  totalPassed += phase84SyncResult.passed;
  totalFailed += phase84SyncResult.failed;

  const phase84AsyncResult = await runPhase84AsyncTests();
  totalPassed += phase84AsyncResult.passed;
  totalFailed += phase84AsyncResult.failed;

  // Phase 85: Checkpoint Persistence Migration (localStorage → IndexedDB)
  const phase85SyncResult = runPhase85Tests();
  totalPassed += phase85SyncResult.passed;
  totalFailed += phase85SyncResult.failed;

  const phase85AsyncResult = await runPhase85AsyncTests();
  totalPassed += phase85AsyncResult.passed;
  totalFailed += phase85AsyncResult.failed;

  // Phase 86: Production Bilingual Corpus Expansion & Training Baseline
  const phase86SyncResult = runPhase86Tests();
  totalPassed += phase86SyncResult.passed;
  totalFailed += phase86SyncResult.failed;

  const phase86AsyncResult = await runPhase86AsyncTests();
  totalPassed += phase86AsyncResult.passed;
  totalFailed += phase86AsyncResult.failed;

  // Phase 87: Training Recipe Sweep (context length + longer training)
  const phase87SyncResult = runPhase87Tests();
  totalPassed += phase87SyncResult.passed;
  totalFailed += phase87SyncResult.failed;

  const phase87AsyncResult = await runPhase87AsyncTests();
  totalPassed += phase87AsyncResult.passed;
  totalFailed += phase87AsyncResult.failed;

  // Phase 88: Training/Evaluation Alignment diagnostic contracts (sync only)
  const phase88SyncResult = runPhase88Tests();
  totalPassed += phase88SyncResult.passed;
  totalFailed += phase88SyncResult.failed;

  // Phase 89: Corrected 1-step training objective regression contracts (sync only)
  const phase89SyncResult = runPhase89Tests();
  totalPassed += phase89SyncResult.passed;
  totalFailed += phase89SyncResult.failed;

  // Phase 90: Document-boundary / sequence-layout alignment contracts (sync only)
  const phase90SyncResult = runPhase90Tests();
  totalPassed += phase90SyncResult.passed;
  totalFailed += phase90SyncResult.failed;

  // Phase 91: Generation path audit & Level-4 readiness (real checkpoint) (sync only)
  const phase91SyncResult = runPhase91Tests();
  totalPassed += phase91SyncResult.passed;
  totalFailed += phase91SyncResult.failed;

  // Phase 92: Tokenizer merge budget experiment — contract suite (sync only)
  const phase92SyncResult = runPhase92Tests();
  totalPassed += phase92SyncResult.passed;
  totalFailed += phase92SyncResult.failed;

  // Phase 93: Model capacity sweep — contract suite (sync only)
  const phase93SyncResult = runPhase93Tests();
  totalPassed += phase93SyncResult.passed;
  totalFailed += phase93SyncResult.failed;

  // Phase 94: Rollout-data augmentation — contract suite (sync only)
  const phase94SyncResult = runPhase94Tests();
  totalPassed += phase94SyncResult.passed;
  totalFailed += phase94SyncResult.failed;

  // Phase 95: Generation-evaluation instrument repair — contract suite + oracle (sync only)
  const phase95SyncResult = runPhase95Tests();
  totalPassed += phase95SyncResult.passed;
  totalFailed += phase95SyncResult.failed;

  // Phase 96: Augmentation transfer experiment — static + artifact contracts (sync only)
  const phase96SyncResult = runPhase96Tests();
  totalPassed += phase96SyncResult.passed;
  totalFailed += phase96SyncResult.failed;

  // Phase 97: Position/context alignment audit — determinism, geometry and
  // decision-gate contracts (sync only; no training is run by this phase)
  const phase97SyncResult = runPhase97Tests();
  totalPassed += phase97SyncResult.passed;
  totalFailed += phase97SyncResult.failed;

  // Phase 98: CJK/mixed interior byte-corruption audit — trace, corpus-support,
  // classification and frozen-surface contracts (sync only; no training)
  const phase98SyncResult = runPhase98Tests();
  totalPassed += phase98SyncResult.passed;
  totalFailed += phase98SyncResult.failed;

  // Phase 99: CJK transition logit mechanism audit — reconstruction, logit,
  // byte-phase, corpus-support and checkpoint-determinism contracts over the
  // real checkpoints (sync only; no training)
  const phase99SyncResult = runPhase99Tests();
  totalPassed += phase99SyncResult.passed;
  totalFailed += phase99SyncResult.failed;

  // Phase 100: CJK opening-token mechanism test — vocabulary-shape,
  // merge-table-completeness, checkpoint-compatibility, determinism and
  // decision-record contracts (sync only; no training, no generation)
  const phase100SyncResult = runPhase100Tests();
  totalPassed += phase100SyncResult.passed;
  totalFailed += phase100SyncResult.failed;

  // Phase 101: UTF-8 phase-constrained decode audit — byte-legality, mask,
  // determinism, Phase-99 parity, paired-result and frozen-surface contracts
  // (sync only; no training, no checkpoint write)
  const phase101SyncResult = runPhase101Tests();
  totalPassed += phase101SyncResult.passed;
  totalFailed += phase101SyncResult.failed;

  // Phase 102: P0 phase-mask audit — P0 byte-legality, P0 candidate-set,
  // P12-mask identity at P1/P2, Phase-101 reproduction, static-P0 gate,
  // mirror-symmetry, reproducibility and frozen-surface contracts
  // (sync only; no training, no checkpoint write)
  const phase102SyncResult = runPhase102Tests();
  totalPassed += phase102SyncResult.passed;
  totalFailed += phase102SyncResult.failed;

  // Phase 103: Byte-phase symmetry correlation audit — forced-P1
  // construction, byte-offset mapping, distribution extraction, correlation
  // and tie policy, permutation-null determinism, controls, state
  // reconstruction, decision rules and frozen-surface contracts
  // (sync only; no training, no checkpoint write)
  const phase103SyncResult = runPhase103Tests();
  totalPassed += phase103SyncResult.passed;
  totalFailed += phase103SyncResult.failed;

  // Phase 104: P0 preceding-boundary ranking audit — S0/S1/S2
  // reconstruction, character-boundary rule, S0 continuation-byte
  // projection, R0/R1 paired difference, permutation-null determinism,
  // classification reachability, synthetic instrument control and
  // frozen-surface contracts
  // (sync only; no training, no checkpoint write)
  const phase104SyncResult = runPhase104Tests();
  totalPassed += phase104SyncResult.passed;
  totalFailed += phase104SyncResult.failed;

  // Phase 105: lead-conditioned character-start audit — vocabulary census,
  // projection definition, corrected-statistic, permutation-null,
  // model-free vocabulary-only control, classification-reachability,
  // Phase-104 replay and frozen-surface contracts
  // (sync only; no training, no checkpoint write)
  const phase105SyncResult = runPhase105Tests();
  totalPassed += phase105SyncResult.passed;
  totalFailed += phase105SyncResult.failed;

  // Phase 106: single-lead conditioning audit — top-legal-lead selection,
  // midrank tie handling, single-lead continuation projection, feasibility
  // F1..F5, the pre-registered rank-16 / 6-of-11 boundary, Phase-105 baseline
  // reproduction and frozen-surface contracts
  // (sync only; no training, no checkpoint write, no generation)
  const phase106SyncResult = runPhase106Tests();
  totalPassed += phase106SyncResult.passed;
  totalFailed += phase106SyncResult.failed;

  // Phase 107: S0 unconditional mass separation audit — byte-level mass
  // partition over the raw S0 distribution, the frozen failure-derived median
  // threshold, its single held-out application to the 210 intact P0 states,
  // the descriptive sign test and single-seed permutation control, and the
  // frozen Phase-102 / Phase-106 surface contracts
  // (sync only; no training, no checkpoint write, no generation)
  const phase107SyncResult = runPhase107Tests();
  totalPassed += phase107SyncResult.passed;
  totalFailed += phase107SyncResult.failed;

  // Phase 108: gap-matched S0 geometry audit — the pre-registered
  // `tokensAfterBoundary >= 2` stratum, exact-gap matching against the frozen
  // Phase-107 populations with the fixed ±1 fallback, the matched median
  // difference, the fixed-seed permutation null, the single deterministic
  // random-label control, the full S0->P0 geometry record and the
  // frozen-surface contracts
  // (sync only; no training, no checkpoint write, no generation)
  const phase108SyncResult = runPhase108Tests();
  totalPassed += phase108SyncResult.passed;
  totalFailed += phase108SyncResult.failed;

  // Phase 109: single-state residual robustness audit — the pre-registered
  // `argmax(delta)` leave-one-out removal over the Phase-108 match set, the
  // exact Phase-108 baseline reproduction, the identical stratum / matching /
  // statistic / permutation design / random-label control on the reduced
  // population, the original-versus-H109 comparison, the leakage audit and the
  // frozen-surface contracts
  // (sync only; no training, no checkpoint write, no generation, no model load)
  const phase109SyncResult = runPhase109Tests();
  totalPassed += phase109SyncResult.passed;
  totalFailed += phase109SyncResult.failed;

  // Phase 110: failure-population completeness audit — the enumeration of
  // Population A (the recorded trajectories), Population B (the 11 recorded
  // failure states) and Population C (the divergent-decision census), the exact
  // composite-key join between them, the derived 12 -> 11 transformation, the
  // pre-registered falsifier and the frozen-surface contracts
  // (sync only; no training, no checkpoint write, no generation, no model load)
  const phase110SyncResult = runPhase110Tests();
  totalPassed += phase110SyncResult.passed;
  totalFailed += phase110SyncResult.failed;

  // Phase 113: minimal chat SFT — dataset split/count contracts, chat
  // template, assistant-only mask and EOS alignment, pair-boundary
  // tokenization diagnostics, deterministic mismatched-answer control,
  // and skip-with-report artifact contracts
  // (sync only; no training, no generation, no checkpoint load)
  const phase113Result = runPhase113Tests();
  totalPassed += phase113Result.passed;
  totalFailed += phase113Result.failed;

  console.log("\n" + "=".repeat(60));
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  console.log("=".repeat(60));

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

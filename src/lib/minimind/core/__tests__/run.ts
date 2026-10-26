// ============================================================
// Test runner for MiniMind Core
// ============================================================
// Run with: npx tsx src/lib/minimind/core/__tests__/run.ts
// ============================================================

import { runTensorTests } from "./tensor.test";
import { runRandomTests } from "../random/__tests__/random.test";
import { runGradientTests } from "./gradient_tests.test";
import { runParameterTests } from "./parameter.test";
import { runLinearTests } from "./linear.test";
import { runEmbeddingTests } from "./embedding.test";
import { runFFNTests } from "./ffn.test";
import { runRMSNormTests } from "./rmsnorm.test";
import { runAttentionTests } from "./attention.test";
import { runTransformerTests } from "./transformer.test";
import { runModelTests } from "./model.test";
import { runLossTests } from "./loss.test";
import { runOptimTests } from "./optim.test";
import { runTinyTrainTests } from "./tiny_train.test";
import {
  runDatasetTests,
  runTextDatasetTests,
  runBatchSamplerTests,
  runDataLoaderTests,
} from "../../data/__tests__/dataset.test";
import { runTrainerTests } from "../../training/__tests__/trainer.test";
import { runSchedulerTests } from "./scheduler.test";
import { runPhase46Tests } from "../../training/__tests__/phase46-experiment.test";

let totalPassed = 0;
let totalFailed = 0;

console.log("=".repeat(60));
console.log("MiniMind Core — Test Suite");
console.log("=".repeat(60));

// Tensor tests
const tensorResult = runTensorTests();
totalPassed += tensorResult.passed;
totalFailed += tensorResult.failed;

// Random engine tests (Phase 47)
const randomResult = runRandomTests();
totalPassed += randomResult.passed;
totalFailed += randomResult.failed;

// Gradient tests
const gradResult = runGradientTests();
totalPassed += gradResult.passed;
totalFailed += gradResult.failed;

// Parameter system tests
const paramResult = runParameterTests();
totalPassed += paramResult.passed;
totalFailed += paramResult.failed;

// Linear & TensorLMHead tests
const linearResult = runLinearTests();
totalPassed += linearResult.passed;
totalFailed += linearResult.failed;

// TensorEmbedding tests (Phase 33)
const embeddingResult = runEmbeddingTests();
totalPassed += embeddingResult.passed;
totalFailed += embeddingResult.failed;

// SiLU & TensorFeedForward tests (Phase 33)
const ffnResult = runFFNTests();
totalPassed += ffnResult.passed;
totalFailed += ffnResult.failed;

// TensorRMSNorm tests (Phase 34)
const rmsnormResult = runRMSNormTests();
totalPassed += rmsnormResult.passed;
totalFailed += rmsnormResult.failed;

// TensorAttention tests (Phase 35)
const attentionResult = runAttentionTests();
totalPassed += attentionResult.passed;
totalFailed += attentionResult.failed;

// TensorTransformerBlock tests (Phase 36)
const transformerResult = runTransformerTests();
totalPassed += transformerResult.passed;
totalFailed += transformerResult.failed;

// TensorMiniMindModel tests (Phase 37)
const modelResult = runModelTests();
totalPassed += modelResult.passed;
totalFailed += modelResult.failed;

// CrossEntropyLoss tests (Phase 38)
const lossResult = runLossTests();
totalPassed += lossResult.passed;
totalFailed += lossResult.failed;

// Optimizer tests (Phase 38)
const optimResult = runOptimTests();
totalPassed += optimResult.passed;
totalFailed += optimResult.failed;

// Tiny Training Demo tests (Phase 38)
const trainResult = runTinyTrainTests();
totalPassed += trainResult.passed;
totalFailed += trainResult.failed;

// Data module tests (Phase 40)
const dataDatasetResult = runDatasetTests();
totalPassed += dataDatasetResult.passed;
totalFailed += dataDatasetResult.failed;

const dataTextDatasetResult = runTextDatasetTests();
totalPassed += dataTextDatasetResult.passed;
totalFailed += dataTextDatasetResult.failed;

const dataBatchSamplerResult = runBatchSamplerTests();
totalPassed += dataBatchSamplerResult.passed;
totalFailed += dataBatchSamplerResult.failed;

const dataDataLoaderResult = runDataLoaderTests();
totalPassed += dataDataLoaderResult.passed;
totalFailed += dataDataLoaderResult.failed;

// Trainer tests (Phase 41)
const trainerResult = runTrainerTests();
totalPassed += trainerResult.passed;
totalFailed += trainerResult.failed;

// Scheduler tests (Phase 42)
const schedulerResult = runSchedulerTests();
totalPassed += schedulerResult.passed;
totalFailed += schedulerResult.failed;

// Phase 46 Experiment Pipeline tests
const phase46Result = runPhase46Tests();
totalPassed += phase46Result.passed;
totalFailed += phase46Result.failed;

console.log("\n" + "=".repeat(60));
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log("=".repeat(60));

if (totalFailed > 0) {
  process.exit(1);
}

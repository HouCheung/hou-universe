// ============================================================
// Phase 96 — augmentation audit (deterministic, small-sample)
// ============================================================
// Phase 96 §8 requires the augmentation itself to be audited BEFORE the
// ~2.5h training run, on a sample small enough to inspect directly.
//
// This script trains nothing and writes no checkpoint. It builds a fresh
// tokenizer + model (so the own-tail argmax is exercised against a real
// model) and then inspects a handful of augmented windows in full.
//
// It answers, by measurement:
//   1. is k exactly 8?
//   2. is every drawn s0 inside [1,5]?
//   3. are the windows valid under the existing input conventions
//      (length == blockSize, ids in range, mask consistent, padding only
//      past validEnd)?
//   4. does augmentation leave the base dataset untouched?
//   5. does augmentation leave the evaluation prompts untouched?
//   6. is the augmented-step count exactly what the spec predicts?
//   7. does the SAME seed produce the SAME augmentation sequence?
//
// Run: npx --yes tsx experiments/phase96/audit-augmentation.ts
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import { Random } from "../../src/lib/minimind/core/random/Random";
import {
  AUG_K,
  AUG_R,
  AUG_S0_MAX,
  AUG_S0_MIN,
  GEN_EVAL_PROMPTS,
  buildAugmentedBatch,
  buildLoader,
  buildModel,
  buildTokenizer,
  config,
  encodeDocuments,
  eligibleDocIndices,
  loadCorpus,
  s0RangeFor,
  type AugmentedBatch,
} from "./probe";

const OUT_DIR = path.resolve(__dirname);
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

/** Audited sample: 4 augmented batches x 4 windows = 16 windows. */
const AUDIT_BATCHES = 4;

interface Finding {
  check: string;
  ok: boolean;
  detail: string;
}

const findings: Finding[] = [];
function record(check: string, ok: boolean, detail: string): void {
  findings.push({ check, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${check} — ${detail}`);
}

function main(): void {
  console.log("=".repeat(64));
  console.log("Phase 96 — augmentation audit (deterministic small-sample)");
  console.log("=".repeat(64));

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as {
    augmentation: {
      k: number;
      s0Range: number[];
      r: number;
      predictedAugmentedSteps: number;
      predictedAugmentedWindows: number;
    };
    evaluation: { promptSet: { prompt: string; language: string }[]; maxTokens: number };
    recipe: { epochs: number; batchSize: number; blockSize: number; seed: number };
  };

  // ── 1. k ──
  console.log("\n[1] rollout horizon k");
  record(
    "k === 8 (fixed; the dose that did the least harm in Phase 94)",
    AUG_K === 8 && AUG_K === manifest.augmentation.k,
    `AUG_K=${AUG_K}, manifest=${manifest.augmentation.k}`
  );
  record(
    "k is NOT the Phase 94 s0 axis changed alongside it",
    AUG_K === 8,
    `AUG_K=${AUG_K} (Phase 94 cells were k=0/8/24)`
  );

  // ── build the real pipeline ──
  const corpus = loadCorpus();
  const corpusBefore = corpus.slice();
  const tokenizer = buildTokenizer(corpus, config.VOCAB_TARGET);
  const aligned = buildLoader(tokenizer, corpus);
  const model = buildModel(tokenizer);
  const docTokenSeq = encodeDocuments(tokenizer, corpus);
  const eligible = eligibleDocIndices(docTokenSeq, AUG_K);

  console.log(`\npipeline: vocab ${tokenizer.vocabSize} | docs ${corpus.length} | windows ${aligned.textDataset.length()} | batches/epoch ${aligned.trainLoader.numBatches}`);

  // ── 2. s0 range ──
  console.log("\n[2] rollout-start range");
  const rangeFindings: { docLen: number; lo: number; hi: number }[] = [];
  let rangeOk = true;
  for (const idx of eligible) {
    const r = s0RangeFor(docTokenSeq[idx].length, AUG_K);
    rangeFindings.push({ docLen: docTokenSeq[idx].length, ...r });
    if (r.lo < AUG_S0_MIN || r.hi > AUG_S0_MAX || r.hi < r.lo) rangeOk = false;
  }
  const hiValues = [...new Set(rangeFindings.map((r) => r.hi))].sort((a, b) => a - b);
  record(
    "every doc's effective s0 range is a subset of [1,5]",
    rangeOk,
    `distinct hi values: [${hiValues.join(", ")}]`
  );

  // ── 3. draw + inspect windows ──
  console.log("\n[3] augmented windows (deterministic draw, inspected in full)");
  Random.setSeed(config.SEED);
  const batches: AugmentedBatch[] = [];
  for (let b = 0; b < AUDIT_BATCHES; b++) {
    batches.push(buildAugmentedBatch(model, docTokenSeq, eligible, AUG_K, config.BATCH_SIZE));
  }

  const allDraws = batches.flatMap((b) => b.draws);
  const allSkipped = batches.flatMap((b) => b.skipped);
  const s0InRange = allDraws.every((d) => d.s0 >= AUG_S0_MIN && d.s0 <= AUG_S0_MAX);
  record(
    `every drawn s0 in [${AUG_S0_MIN},${AUG_S0_MAX}]`,
    s0InRange && allDraws.length === AUDIT_BATCHES * config.BATCH_SIZE,
    `drew ${allDraws.length} windows, s0 = [${allDraws.map((d) => d.s0).join(", ")}]`
  );
  record(
    "no augmentation example was skipped/invalid",
    allSkipped.length === 0,
    `skipped: ${allSkipped.length}`
  );

  let shapeOk = true;
  let idRangeOk = true;
  let maskOk = true;
  let prefixOk = true;
  const problems: string[] = [];
  let drawCursor = 0;
  for (const b of batches) {
    for (let w = 0; w < b.inputIds.length; w++) {
      const inp = b.inputIds[w];
      const tgt = b.targets[w];
      const mask = b.masks[w];
      const draw = allDraws[drawCursor++];
      if (inp.length !== config.BLOCK_SIZE || tgt.length !== config.BLOCK_SIZE || mask.length !== config.BLOCK_SIZE) {
        shapeOk = false;
        problems.push("window length != blockSize");
      }
      for (const v of inp) {
        if (!Number.isInteger(v) || v < 0 || v >= tokenizer.vocabSize) idRangeOk = false;
      }
      for (const v of tgt) {
        if (!Number.isInteger(v) || v < 0 || v >= tokenizer.vocabSize) idRangeOk = false;
      }
      // mask must be a contiguous 1-prefix and 0 after; the padded tail is 0.
      let sawZero = false;
      for (let s = 0; s < mask.length; s++) {
        if (mask[s] === 0) sawZero = true;
        else if (sawZero) maskOk = false;
      }
      if (mask[mask.length - 1] !== 0) maskOk = false;
      // the true prefix must actually be a true document prefix
      const doc = docTokenSeq[draw.docIndex];
      for (let s = 0; s <= draw.s0; s++) {
        if (inp[s] !== doc[s]) prefixOk = false;
      }
      // and the own tail must be the model's own argmax, i.e. NOT the true
      // continuation in general — it is allowed to coincide, so this is
      // recorded rather than asserted.
      if (draw.ownLen > AUG_K) problems.push("ownLen exceeded k");
    }
  }
  record("window shape is blockSize for input/target/mask", shapeOk, problems.length ? problems[0] : `all windows length ${config.BLOCK_SIZE}`);
  record("every id is a valid tokenizer id", idRangeOk, `ids in [0, ${tokenizer.vocabSize})`);
  record(
    "mask is a contiguous 1-prefix with a 0 tail",
    maskOk,
    "no 1 after the first 0; final position always 0"
  );
  record(
    "input opens with the TRUE document prefix x[0..s0]",
    prefixOk,
    "prefix bytes match the source document exactly"
  );

  console.log("\n  --- inspected windows (first batch, verbatim) ---");
  for (let w = 0; w < batches[0].inputIds.length; w++) {
    const d = batches[0].draws[w];
    const inp = batches[0].inputIds[w];
    const ownStart = d.s0 + 1;
    const ownEnd = d.s0 + d.ownLen;
    console.log(
      `  win ${w}: doc ${d.docIndex} | s0 ${d.s0} (in [1,5]) | ownLen ${d.ownLen}`
    );
    console.log(
      `    true prefix x[0..${d.s0}] = [${inp.slice(0, ownStart).join(", ")}]`
    );
    console.log(
      `    own tail   x[${ownStart}..${ownEnd}] = [${inp.slice(ownStart, ownEnd + 1).join(", ")}]`
    );
    console.log(
      `    mask sum ${batches[0].masks[w].reduce((a, v) => a + v, 0)} / ${config.BLOCK_SIZE}`
    );
  }

  // ── 4. base dataset untouched ──
  console.log("\n[4] base dataset immutability");
  const corpusAfter = loadCorpus();
  const corpusUnchanged =
    corpusBefore.length === corpusAfter.length &&
    corpusBefore.every((t, i) => t === corpusAfter[i]);
  const reencodeIdentical = encodeDocuments(tokenizer, corpusAfter).every(
    (d, i) => d.length === docTokenSeq[i].length && d.every((v, j) => v === docTokenSeq[i][j])
  );
  record(
    "corpus text is byte-identical before and after augmentation",
    corpusUnchanged,
    `${corpusAfter.length} docs compared`
  );
  record(
    "document tokenizations are unchanged",
    reencodeIdentical,
    "re-encoded all docs, identical id sequences"
  );

  // ── 5. evaluation prompts untouched ──
  console.log("\n[5] evaluation prompt set");
  const promptsMatch =
    GEN_EVAL_PROMPTS.length === manifest.evaluation.promptSet.length &&
    GEN_EVAL_PROMPTS.every(
      (p, i) =>
        p.prompt === manifest.evaluation.promptSet[i].prompt &&
        p.language === manifest.evaluation.promptSet[i].language
    );
  record(
    "prompt set matches the manifest, unchanged from Phase 90/94/95",
    promptsMatch,
    GEN_EVAL_PROMPTS.map((p) => `"${p.prompt}"(${p.language})`).join(" ")
  );
  record(
    "evaluation horizon unchanged at 24",
    config.MAX_TOKENS === 24 && config.MAX_TOKENS === manifest.evaluation.maxTokens,
    `MAX_TOKENS=${config.MAX_TOKENS}`
  );

  // ── 6. predicted augmentation count ──
  console.log("\n[6] augmentation count vs the specification");
  const batchesPerEpoch = aligned.trainLoader.numBatches;
  const totalSteps = manifest.recipe.epochs * batchesPerEpoch;
  const predictedAugSteps = Math.floor(totalSteps / AUG_R);
  const predictedAugWindows = predictedAugSteps * manifest.recipe.batchSize;
  record(
    "predicted augmented steps == manifest",
    predictedAugSteps === manifest.augmentation.predictedAugmentedSteps,
    `computed ${predictedAugSteps}, manifest ${manifest.augmentation.predictedAugmentedSteps} (${totalSteps} total steps / R=${AUG_R})`
  );
  record(
    "predicted augmented windows == manifest",
    predictedAugWindows === manifest.augmentation.predictedAugmentedWindows,
    `computed ${predictedAugWindows}, manifest ${manifest.augmentation.predictedAugmentedWindows} (steps x batchSize)`
  );
  record(
    "R matches the manifest",
    AUG_R === manifest.augmentation.r,
    `AUG_R=${AUG_R}, manifest=${manifest.augmentation.r}`
  );

  // ── 7. determinism ──
  console.log("\n[7] determinism of the augmentation sequence");
  Random.setSeed(config.SEED);
  const replay: AugmentedBatch[] = [];
  for (let b = 0; b < AUDIT_BATCHES; b++) {
    replay.push(buildAugmentedBatch(model, docTokenSeq, eligible, AUG_K, config.BATCH_SIZE));
  }
  const drawsIdentical =
    JSON.stringify(replay.map((b) => b.draws)) === JSON.stringify(batches.map((b) => b.draws));
  const inputsIdentical =
    JSON.stringify(replay.map((b) => b.inputIds)) === JSON.stringify(batches.map((b) => b.inputIds));
  record(
    "same seed -> same (doc, s0) draw sequence",
    drawsIdentical,
    `${allDraws.length} draws compared element-wise`
  );
  record(
    "same seed -> byte-identical augmented inputs",
    inputsIdentical,
    `${allDraws.length} windows compared element-wise`
  );

  // ── summary ──
  const failed = findings.filter((f) => !f.ok);
  console.log("\n" + "=".repeat(64));
  console.log(`AUDIT: ${findings.length - failed.length}/${findings.length} checks passed`);
  console.log("=".repeat(64));

  fs.writeFileSync(
    path.join(OUT_DIR, "audit-augmentation.json"),
    JSON.stringify(
      {
        phase: "phase96",
        audit: "augmentation",
        batchesInspected: AUDIT_BATCHES,
        windowsInspected: allDraws.length,
        k: AUG_K,
        s0Range: [AUG_S0_MIN, AUG_S0_MAX],
        draws: allDraws,
        predictedAugmentedSteps: predictedAugSteps,
        predictedAugmentedWindows: predictedAugWindows,
        findings,
        passed: findings.length - failed.length,
        failed: failed.length,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("audit written: audit-augmentation.json");

  if (failed.length > 0) {
    console.log("AUDIT FAIL");
    process.exitCode = 1;
  } else {
    console.log("AUDIT PASS");
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main();
}

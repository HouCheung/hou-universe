// ============================================================
// Phase 100 — CJK opening-token mechanism test (contract suite)
// ============================================================
// Phase 100 asked whether changing ONLY the tokenization of the opening of
// a 3-byte CJK character changes the model's P2 generation behaviour, with
// frozen checkpoints and no training.
//
// The phase's outcome is BLOCKED: the intervention cannot be expressed as
// a merge-table-only change while the checkpoints stay frozen. This suite
// therefore does NOT check a BASE/MERGE generation comparison — there is
// none to check. It checks the reason:
//
//   COMPATIBILITY
//   1. vocabulary size is unchanged at 300, and it is exactly
//      256 byte tokens + 4 special tokens + 40 learned merges, so the
//      merge-table row count is not a free parameter
//   2. every vocabulary id and its byte content match the artifact
//   3. the four special tokens are unchanged
//   4. every frozen checkpoint reloads, with embeddings of exactly
//      `vocabSize` rows, and two independent loads are parameter-identical
//
//   MERGE BEHAVIOUR
//   5. exhaustively, ZERO merges can be added without inventing a
//      vocabulary entry — the measurement that blocks the intervention
//   6. the recorded failure segments are still emitted by bare byte tokens
//      under BASE: the intervention's target variable did NOT already move
//   7. no unrelated tokenization changed: ASCII behaviour is unchanged and
//      every ascii-merge token contains only ASCII bytes
//   8. no vocabulary expansion occurred
//
//   DETERMINISM
//   9. the same corpus + seed rebuilds a byte-identical vocabulary
//  10. the same tokenizer state tokenizes identically
//  11. checkpoint reload is deterministic
//
//   REGRESSION
//  12. the Phase-95 evaluator, the Phase-99 audit and the generation
//      implementation are untouched on disk
//  13. the Phase-100 scripts perform no training and write no checkpoint
//
//   HYPOTHESIS MEASUREMENT
//  14. the recorded baselines are READ from the Phase-99 artifact, never
//      restated, and no experiment result is hardcoded
//  15. the decision is Blocked with no MERGE-side number invented
//
// Nothing here pins a measured value that the artifacts do not carry:
// every expectation is either re-derived at test time or read back from the
// artifact being checked. Phase 57-99 suites are untouched.
// ============================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";

import {
  OUT_AUDIT,
  OUT_MANIFEST,
  PHASE99_ARTIFACT,
  sha256File,
  byteKey,
  hexOf,
  measureAddableMerges,
} from "../../../../../experiments/phase100/opening-token-audit";

import {
  ARMS,
  MERGE_TOKEN_MIN_ID,
  SEED,
  VOCAB_TARGET,
  buildTokenizer,
  classifyVocabulary,
  loadCorpus,
  tokenBytes,
} from "../../../../../experiments/phase98/cjk-byte-corruption-audit";

// ============================================================
// Harness — mirrors the Phase 90-99 suites
// ============================================================

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const PHASE_DIR = path.join(ROOT, "experiments", "phase100");

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`    PASS  ${name}`);
  } else {
    failed++;
    console.log(`    FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function skip(name: string, why: string): void {
  skipped++;
  console.log(`    SKIP  ${name} -- ${why}`);
}

// ============================================================
// Artifact views — structural only, no expected VALUES
// ============================================================

interface AuditView {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  generationPerformed: boolean;
  modelForwardPasses: number;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  baseTokenizerState: {
    vocabSize: number;
    byteTokenCount: number;
    specialTokenCount: number;
    mergeTableRowCount: number;
    mergeBudget: number;
    asciiMergeTokens: { id: number; bytesHex: string }[];
    cjkPartialMergeTokens: { id: number; bytesHex: string }[];
    cjkCompleteMergeTokens: { id: number; bytesHex: string }[];
    vocabularyDigest: string;
  };
  mergeTokenizerState: { constructed: boolean; changedMerges: string[] };
  addableMergesWithoutVocabularyChange: number;
  failureStateOpeningAudit: {
    armKey: string;
    prompt: string;
    phase: string;
    baseTokenIds: number[] | null;
    baseTokenClasses: string[] | null;
    baseBoundariesInsideChar: number | null;
    baseOpenedByRawLeadByteToken: boolean | null;
    mergeOpeningPrefixHex: string | null;
    mergeOpeningTokenExists: boolean | null;
    mergeRequiredNewTokenBytesHex: string | null;
    mergeConstructibleWithoutVocabularyChange: boolean | null;
    interventionApplies: boolean;
  }[];
  affectedCharacterSummary: {
    distinct: number;
    alreadyMergeOpened: number;
    requiringNewToken: number;
  };
  checkpointIntegrity: {
    arm: string;
    checkpoint: string;
    sha256Before: string;
    sha256After: string;
    unchangedOnDisk: boolean;
    mtimeIso: string;
    mtimePredatesThisPhase: boolean;
    loadSucceeded: boolean;
    embeddingShape: string;
    embeddingRowsMatchVocab: boolean;
    mismatchCount: number;
    maxAbsDiff: number;
  }[];
  invariantCheck: {
    mergeVariantExists: boolean;
    comparisonAdmissible: boolean;
    classification: string;
  };
  decision: {
    tested: boolean;
    baseCorruptionCount: number;
    mergeCorruptionCount: number | null;
    baseP2LegalMass: number | null;
    mergeP2LegalMass: number | null;
    acceptanceTestReached: boolean;
    classification: string;
    classificationStatement: string;
  };
  integrity: {
    productionModulesModified: string[];
    checkpointsWritten: boolean;
    checkpointsUnchangedOnDisk: boolean;
    trainingStepsRun: number;
  };
}

interface Phase99View {
  aggregate: { totalRecordedGenerations: number; auditedFailureStates: number };
  bytePhaseAnalysis: {
    failuresByPhase: { phase: string; states: number; meanCompatibleMass: number }[];
  };
}

interface ManifestView {
  status: string;
  vocabularySize: number;
  changedMerges: string[];
  mergeTokenizerState: { constructed: boolean };
  checkpointIdentifiers: {
    arm: string;
    path: string;
    sha256: string;
    embeddingShape: string;
    unchangedOnDisk: boolean;
  }[];
  promptSet: { prompt: string; language: string }[];
  blockingEvidence: {
    failuresWhereInterventionApplies: number;
    failureStatesRequiringNewVocabularyEntry: number;
    addableMergesWithoutVocabularyChange: number;
    embeddingRowsPerCheckpoint: number;
  };
}

function readJson<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

/**
 * Working-tree state of a repo path.
 *
 * `"modified"` means git has a committed (or staged) baseline and the
 * working tree differs from it — the only state that is a regression.
 * `"untracked"` means the file has no committed baseline at all: this
 * repository carries a large uncommitted Phase 57-99 backlog, so several
 * frozen surfaces were never committed. It is not evidence of a change,
 * and it is reported as such rather than silently passed.
 */
type WorkTreeState = "clean" | "untracked" | "modified" | "unknown";

function workTreeState(relPath: string): WorkTreeState {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--", relPath], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (out.length === 0) return "clean";
    if (out.startsWith("??")) return "untracked";
    return "modified";
  } catch {
    return "unknown";
  }
}

/** Strips line and block comments so a source scan tests code, not prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ============================================================
// Cached measurements — the corpus and tokenizer are built once
// ============================================================

let corpusCache: string[] | null = null;
let tokenizerCache: ReturnType<typeof buildTokenizer> | null = null;

function corpus(): string[] {
  if (corpusCache === null) corpusCache = loadCorpus();
  return corpusCache;
}

function tokenizer(): ReturnType<typeof buildTokenizer> {
  if (tokenizerCache === null) tokenizerCache = buildTokenizer(corpus(), VOCAB_TARGET);
  return tokenizerCache;
}

// ============================================================
// 1-3, 8 — Compatibility: vocabulary shape, ids, special tokens
// ============================================================

function testVocabularyCompatibility(a: AuditView | null): void {
  const tk = tokenizer();
  const idToToken = tk.getVocabulary().idToToken;
  const vocab = classifyVocabulary(idToToken, tk.vocabSize);

  // 1. Shape: vocabSize is byte + special + merge, with nothing free.
  const byteCount = vocab.filter((v) => v.tokenClass === "byte").length;
  const specialCount = vocab.filter((v) => v.tokenClass === "special").length;
  const mergeCount = vocab.filter((v) => v.id >= MERGE_TOKEN_MIN_ID).length;

  check(
    "vocabulary size equals byte + special + merge token counts",
    tk.vocabSize === byteCount + specialCount + mergeCount,
    `vocabSize=${tk.vocabSize} bytes=${byteCount} special=${specialCount} merges=${mergeCount}`
  );
  check(
    "byte tokens occupy ids 4..259 (256 of them)",
    byteCount === 256 && vocab.filter((v) => v.tokenClass === "byte").every(
      (v) => v.id >= 4 && v.id < 260
    )
  );
  check("four special tokens", specialCount === 4);

  // 2. The merge-table row count is not a free parameter.
  check(
    `merge-table rows are exactly vocabSize - ${MERGE_TOKEN_MIN_ID}`,
    mergeCount === tk.vocabSize - MERGE_TOKEN_MIN_ID,
    `merges=${mergeCount} vocabSize=${tk.vocabSize}`
  );
  check(
    `merge budget is VOCAB_TARGET - ${MERGE_TOKEN_MIN_ID}`,
    mergeCount === VOCAB_TARGET - MERGE_TOKEN_MIN_ID
  );

  // 3. Special tokens are the four frozen ids with byte content.
  const specialBytes = [0, 1, 2, 3].map((id) => hexOf(tokenBytes(idToToken, id)));
  check("special tokens 0..3 all carry byte content", specialBytes.every((h) => h.length > 0));
  check(
    "special token count matches the artifact",
    a === null || a.baseTokenizerState.specialTokenCount === specialCount
  );

  // 8. No vocabulary expansion: every id is accounted for and contiguous.
  const ids = vocab.map((v) => v.id).sort((x, y) => x - y);
  check(
    "vocabulary ids are contiguous 0..vocabSize-1 (no invented ids)",
    ids.length === tk.vocabSize && ids[0] === 0 && ids[ids.length - 1] === tk.vocabSize - 1,
    `ids=${ids.length} vocabSize=${tk.vocabSize}`
  );

  if (a !== null) {
    check(
      "artifact records the same vocabulary size",
      a.baseTokenizerState.vocabSize === tk.vocabSize,
      `artifact=${a.baseTokenizerState.vocabSize} measured=${tk.vocabSize}`
    );
    check(
      "artifact records the same byte/merge/special counts",
      a.baseTokenizerState.byteTokenCount === byteCount &&
        a.baseTokenizerState.mergeTableRowCount === mergeCount,
      `artifact bytes=${a.baseTokenizerState.byteTokenCount} merges=${a.baseTokenizerState.mergeTableRowCount}`
    );

    // 2 (continued). Every id's byte content still matches the artifact.
    const cjkPartial = vocab.filter((v) => v.tokenClass === "cjk-partial-merge");
    const cjkComplete = vocab.filter((v) => v.tokenClass === "cjk-complete-merge");
    const asciiMerge = vocab.filter((v) => v.tokenClass === "ascii-merge");
    const sameList = (
      measured: { id: number; bytesHex: string }[],
      recorded: { id: number; bytesHex: string }[]
    ): boolean =>
      measured.length === recorded.length &&
      measured.every(
        (m, i) => m.id === recorded[i].id && m.bytesHex === recorded[i].bytesHex
      );

    check(
      "cjk-partial-merge token ids and bytes match the artifact",
      sameList(
        cjkPartial.map((v) => ({ id: v.id, bytesHex: hexOf(v.bytes) })),
        a.baseTokenizerState.cjkPartialMergeTokens
      )
    );
    check(
      "cjk-complete-merge token ids and bytes match the artifact",
      sameList(
        cjkComplete.map((v) => ({ id: v.id, bytesHex: hexOf(v.bytes) })),
        a.baseTokenizerState.cjkCompleteMergeTokens
      )
    );
    check(
      "ascii-merge token ids and bytes match the artifact",
      sameList(
        asciiMerge.map((v) => ({ id: v.id, bytesHex: hexOf(v.bytes) })),
        a.baseTokenizerState.asciiMergeTokens
      )
    );

    // 7. ASCII regression: every ascii-merge token is pure ASCII.
    check(
      "every ascii-merge token contains only ASCII bytes",
      asciiMerge.every((v) => v.bytes.every((b) => b < 0x80)),
      `offending=${asciiMerge.filter((v) => !v.bytes.every((b) => b < 0x80)).map((v) => hexOf(v.bytes)).join(" | ")}`
    );

    // 6. The base vocabulary digest is reproducible.
    const h = crypto.createHash("sha256");
    for (let id = 0; id < tk.vocabSize; id++) {
      const t = idToToken.get(id);
      h.update(`${id}:${t === undefined ? "<absent>" : t}\n`, "utf8");
    }
    check(
      "vocabulary digest matches the artifact",
      h.digest("hex") === a.baseTokenizerState.vocabularyDigest
    );
  }
}

// ============================================================
// 5 — Merge behaviour: NO merge can be added for free
// ============================================================

function testMergeTableCompleteness(a: AuditView | null): void {
  const addable = measureAddableMerges(tokenizer());
  check(
    "no merge can be added without inventing a vocabulary entry",
    addable.length === 0,
    `addable=${addable.length} first=${JSON.stringify(addable[0] ?? null)}`
  );
  if (a !== null) {
    check(
      "artifact records the same addable-merge count",
      a.addableMergesWithoutVocabularyChange === addable.length,
      `artifact=${a.addableMergesWithoutVocabularyChange} measured=${addable.length}`
    );
  }

  // Every learned merge points at an existing vocabulary entry, so no merge
  // can exist whose result is not already an id.
  const tk = tokenizer();
  const idToToken = tk.getVocabulary().idToToken;
  const state = tk.toState();
  const tokenStrings = new Set<string>();
  for (let id = 0; id < tk.vocabSize; id++) {
    const t = idToToken.get(id);
    if (t !== undefined) tokenStrings.add(t);
  }
  const orphans = state.merges.filter((m) => !tokenStrings.has(m.result));
  check(
    "every merge result is an existing vocabulary entry",
    orphans.length === 0,
    `orphans=${orphans.length}`
  );
  check(
    "merge-table row count equals the serialized merge count",
    state.merges.length === tk.vocabSize - MERGE_TOKEN_MIN_ID,
    `serialized=${state.merges.length} expected=${tk.vocabSize - MERGE_TOKEN_MIN_ID}`
  );
}

// ============================================================
// 6 — The intervention's target variable, re-measured on BASE
// ============================================================

function testFailureOpeningState(a: AuditView | null): void {
  if (a === null) {
    skip("failure-state opening contracts", `${OUT_AUDIT} not found — run the audit first`);
    return;
  }

  const tk = tokenizer();
  const idToToken = tk.getVocabulary().idToToken;

  const applicable = a.failureStateOpeningAudit.filter((f) => f.interventionApplies);
  check(
    "the intervention has states it would apply to (P2, two bytes open)",
    applicable.length > 0,
    `applicable=${applicable.length}`
  );

  // Every applicable state must be a genuine P2 state opened by bare bytes.
  check(
    "every applicable state is phase P2",
    applicable.every((f) => f.phase === "P2"),
    applicable.map((f) => f.phase).join(",")
  );
  check(
    "every applicable state is opened by bare byte tokens under BASE",
    applicable.every((f) => f.baseOpenedByRawLeadByteToken === true),
    JSON.stringify(applicable.map((f) => f.baseTokenClasses))
  );
  check(
    "every applicable state has exactly one token boundary inside the character",
    applicable.every((f) => f.baseBoundariesInsideChar === 1),
    JSON.stringify(applicable.map((f) => f.baseBoundariesInsideChar))
  );

  // The decisive check: re-derive that the required 2-byte opening token is
  // ABSENT from the vocabulary, independently of what the artifact claims.
  const prefixKeys = applicable
    .map((f) => f.mergeOpeningPrefixHex)
    .filter((h): h is string => h !== null)
    .map((h) => h.replace(/\s+/g, ""));

  const vocabByteKeys = new Set<string>();
  for (let id = 0; id < tk.vocabSize; id++) {
    const t = idToToken.get(id);
    if (t === undefined) continue;
    const bytes: number[] = [];
    for (let i = 0; i < t.length; i++) bytes.push(t.charCodeAt(i) & 0xff);
    vocabByteKeys.add(byteKey(bytes));
  }

  const present = prefixKeys.filter((k) => vocabByteKeys.has(k));
  const absent = prefixKeys.filter((k) => !vocabByteKeys.has(k));

  check(
    "the required 2-byte opening tokens are ABSENT from the frozen vocabulary",
    absent.length === prefixKeys.length && prefixKeys.length > 0,
    `present=${present.join(",")} absent=${absent.join(",")}`
  );
  check(
    "every applicable state requires a new vocabulary entry",
    applicable.every((f) => f.mergeRequiredNewTokenBytesHex !== null),
    JSON.stringify(applicable.map((f) => f.mergeRequiredNewTokenBytesHex))
  );
  check(
    "no applicable state is already merge-opened (nothing for the intervention to change)",
    applicable.every((f) => f.mergeOpeningTokenExists === false),
    JSON.stringify(applicable.map((f) => f.mergeOpeningTokenExists))
  );

  // States where the intervention has no mechanism at all.
  const p0 = a.failureStateOpeningAudit.filter((f) => f.phase === "P0");
  const p1 = a.failureStateOpeningAudit.filter((f) => f.phase === "P1");
  check(
    "P0 states carry no open character, so no opening tokenization exists to change",
    p0.every((f) => f.baseTokenIds === null && f.mergeOpeningPrefixHex === null),
    JSON.stringify(p0.map((f) => f.mergeOpeningPrefixHex))
  );
  check(
    "P1 states supply a single byte, which no merge can open",
    p1.every((f) => f.mergeConstructibleWithoutVocabularyChange === null),
    JSON.stringify(p1.map((f) => f.mergeOpeningPrefixHex))
  );

  check(
    "affected characters summary is self-consistent",
    a.affectedCharacterSummary.distinct ===
      a.affectedCharacterSummary.alreadyMergeOpened + a.affectedCharacterSummary.requiringNewToken,
    JSON.stringify(a.affectedCharacterSummary)
  );

  // Every recorded base token id must still resolve in the frozen vocabulary.
  const allBaseIds = a.failureStateOpeningAudit
    .flatMap((f) => f.baseTokenIds ?? []);
  check(
    "every recorded BASE token id still resolves in the frozen vocabulary",
    allBaseIds.every((id) => idToToken.get(id) !== undefined || (id >= 4 && id < 260)),
    `unresolved=${allBaseIds.filter((id) => idToToken.get(id) === undefined && !(id >= 4 && id < 260)).join(",")}`
  );

  // 7 (continued) — no unrelated tokenization change: ASCII is untouched.
  const asciiProbe = "machine learning is a test";
  const enc = tk.encode(asciiProbe);
  const bytesFromIds: number[] = [];
  for (const id of enc) for (const b of tokenBytes(idToToken, id)) bytesFromIds.push(b);
  const expected = Array.from(new TextEncoder().encode(asciiProbe));
  check(
    "ASCII tokenization spans exactly the input's UTF-8 bytes",
    byteKey(bytesFromIds) === byteKey(expected),
    `${byteKey(bytesFromIds)} vs ${byteKey(expected)}`
  );
  check(
    "ASCII tokenization is stable across two independent encodes",
    byteKey(tk.encode(asciiProbe)) === byteKey(enc)
  );
}

// ============================================================
// 4 — Checkpoint compatibility
// ============================================================

function testCheckpointCompatibility(a: AuditView | null): void {
  const tk = tokenizer();

  for (const arm of ARMS) {
    const exists = fs.existsSync(arm.checkpointPath);
    if (!exists) {
      skip(`checkpoint ${arm.key}`, "file absent — no state invented");
      continue;
    }

    const raw = JSON.parse(fs.readFileSync(arm.checkpointPath, "utf8")) as {
      modelParams: Record<string, { name: string; shape: number[] }>;
    };
    const params = Object.values(raw.modelParams);
    const emb = params.find((p) => p.name.includes("embedding"));
    check(
      `checkpoint ${arm.key}: embedding rows equal vocabSize (${tk.vocabSize})`,
      emb !== undefined && emb.shape[0] === tk.vocabSize,
      emb ? `embedding=${emb.shape.join("x")}` : "embedding param absent"
    );
  }

  if (a === null) {
    skip("checkpoint integrity contracts", `${OUT_AUDIT} not found`);
    return;
  }

  check(
    "the audit recorded one integrity row per frozen checkpoint",
    a.checkpointIntegrity.length === ARMS.filter((x) => fs.existsSync(x.checkpointPath)).length,
    `rows=${a.checkpointIntegrity.length}`
  );
  check(
    "every checkpoint reload succeeded",
    a.checkpointIntegrity.every((c) => c.loadSucceeded)
  );
  check(
    "every checkpoint's embedding rows match vocabSize",
    a.checkpointIntegrity.every((c) => c.embeddingRowsMatchVocab),
    a.checkpointIntegrity.map((c) => `${c.arm}:${c.embeddingShape}`).join(" ")
  );
  check(
    "two independent loads of each checkpoint are parameter-identical",
    a.checkpointIntegrity.every((c) => c.mismatchCount === 0 && c.maxAbsDiff === 0),
    a.checkpointIntegrity.map((c) => `${c.arm}:mismatch=${c.mismatchCount}`).join(" ")
  );

  // 13/21 — the checkpoint bytes on disk are unchanged, re-hashed here.
  for (const c of a.checkpointIntegrity) {
    const abs = path.join(ROOT, c.checkpoint);
    check(
      `checkpoint ${c.arm} bytes unchanged since the audit`,
      fs.existsSync(abs) && sha256File(abs) === c.sha256Before,
      `${c.checkpoint}`
    );
    check(
      `checkpoint ${c.arm} recorded unchanged on disk during the audit`,
      c.unchangedOnDisk && c.sha256Before === c.sha256After
    );

    // An independent witness: the file's own mtime precedes this phase, so
    // the bytes were not rewritten by it. Re-measured here from disk.
    const mtimeMs = fs.statSync(abs).mtimeMs;
    check(
      `checkpoint ${c.arm} mtime predates this phase (not rewritten)`,
      mtimeMs < Date.parse("2026-09-19T00:00:00+08:00") &&
        c.mtimePredatesThisPhase &&
        Math.abs(mtimeMs - Date.parse(c.mtimeIso)) < 2000,
      `mtime=${new Date(mtimeMs).toISOString()} recorded=${c.mtimeIso}`
    );
  }
}

// ============================================================
// 9-11 — Determinism
// ============================================================

function testDeterminism(): void {
  // 9. Rebuilding from the same corpus + seed gives a byte-identical vocab.
  const rebuilt = buildTokenizer(corpus(), VOCAB_TARGET);
  const a = tokenizer();
  check(
    "rebuilding the tokenizer reproduces the same vocabulary size",
    rebuilt.vocabSize === a.vocabSize,
    `${rebuilt.vocabSize} vs ${a.vocabSize}`
  );

  const digestOf = (tk: ReturnType<typeof buildTokenizer>): string => {
    const idToToken = tk.getVocabulary().idToToken;
    const parts: string[] = [];
    for (let id = 0; id < tk.vocabSize; id++) {
      parts.push(`${id}:${idToToken.get(id) ?? "<absent>"}`);
    }
    return parts.join("\n");
  };
  check(
    "rebuilding the tokenizer reproduces every token id and byte string",
    digestOf(rebuilt) === digestOf(a)
  );

  // 10. The same tokenizer state tokenizes identically.
  const sample = "机器学习是 machine learning 太阳";
  const enc1 = a.encode(sample);
  const enc2 = a.encode(sample);
  check(
    "the same tokenizer state tokenizes identically",
    enc1.length === enc2.length && enc1.every((v, i) => v === enc2[i])
  );
  check(
    "rebuilding the tokenizer reproduces the same tokenization",
    JSON.stringify(rebuilt.encode(sample)) === JSON.stringify(enc1)
  );

  // The seed the build depends on is the inherited frozen one.
  check("the frozen seed is the one the Phase-98 surface declares", SEED === 42);
}

// ============================================================
// 12 — Regression: the frozen surfaces are untouched
// ============================================================

function testFrozenSurfacesUntouched(): void {
  const paths = [
    "src/lib/minimind/research/capability-eval/utf8.ts",
    "experiments/phase99/logit-mechanism-audit.ts",
    "experiments/phase98/cjk-byte-corruption-audit.ts",
    "src/lib/minimind/tokenizer/BPETokenizer.ts",
  ];
  let untracked = 0;
  for (const p of paths) {
    const state = workTreeState(p);
    if (state === "untracked") untracked++;
    check(
      `${p} is not modified`,
      state === "clean" || state === "untracked",
      state === "untracked"
        ? "untracked (no committed baseline: pre-existing Phase 57-99 backlog)"
        : `git state=${state}`
    );
  }
  if (untracked > 0) {
    console.log(
      `    NOTE  ${untracked}/${paths.length} frozen surfaces are untracked — no committed ` +
      `baseline exists to diff against; the content checks below are what cover them`
    );
  }

  // Content-level regression check: none of the frozen surfaces carries a
  // Phase-100 hook, so the intervention was never wired into production.
  for (const p of paths) {
    const src = fs.readFileSync(path.join(ROOT, p), "utf8");
    check(
      `${p} contains no Phase-100 experimental hook`,
      !/phase100|PHASE100|opening-token/i.test(src)
    );
  }

  // The Phase-95 evaluator still exposes exactly one shared UTF-8 scanner,
  // and the generation/scan entry points are still present.
  const utf8Src = fs.readFileSync(
    path.join(ROOT, "src/lib/minimind/research/capability-eval/utf8.ts"),
    "utf8"
  );
  check(
    "the Phase-95 evaluator still exports scanUtf8 and analyzeGeneration",
    utf8Src.includes("export function scanUtf8") && utf8Src.includes("export function analyzeGeneration")
  );
}

// ============================================================
// 13-14 — The Phase-100 scripts train nothing and hardcode nothing
// ============================================================

function testScriptIntegrity(a: AuditView | null): void {
  const scripts = [
    path.join(PHASE_DIR, "feasibility-audit.ts"),
    path.join(PHASE_DIR, "opening-token-audit.ts"),
  ];

  for (const s of scripts) {
    if (!fs.existsSync(s)) {
      skip(`source scan ${path.basename(s)}`, "file absent");
      continue;
    }
    const code = stripComments(fs.readFileSync(s, "utf8"));
    const name = path.basename(s);

    // Model training is the prohibition; `BPETokenizer.train` is the
    // deterministic, zero-optimizer vocabulary build the frozen recipe
    // itself uses, and an AdamWOptimizer is only constructed because
    // `loadCheckpoint` requires one. Neither runs an optimizer step.
    check(`${name}: calls no optimizer step`, !code.includes(".step("));
    check(`${name}: runs no training step`, !/train(Step|Batch|Epoch)\s*\(/.test(code));
    check(`${name}: performs no backward pass`, !/\.backward\s*\(/.test(code));
    check(`${name}: mutates no parameter`, !/\.data\s*\[[^\]]*\]\s*=/.test(code) && !/\.data\s*=\s*/.test(code));
    check(`${name}: saves no checkpoint`, !code.includes("saveCheckpoint"));
    check(`${name}: writes no checkpoint`, !/writeFileSync\s*\([^)]*\.ckpt/.test(code));
    check(`${name}: uses no Math.random`, !code.includes("Math.random"));
    check(`${name}: uses no setTimeout`, !code.includes("setTimeout"));
    check(`${name}: uses no setInterval`, !code.includes("setInterval"));
    check(`${name}: does not sample or trace a generation`, !/sampleToken\(|traceGeneration\(/.test(code));
    check(`${name}: runs no forward pass`, !/\.forward\s*\(/.test(code));

    // The only files it may write are its own artifacts.
    const writes = code.match(/writeFileSync\s*\(([^)]*)/g) ?? [];
    check(
      `${name}: writes only its own artifact paths`,
      writes.length > 0 && writes.every((w) => /OUT_AUDIT|OUT_MANIFEST|OUT_PATH/.test(w)),
      writes.join(" | ")
    );
  }

  if (a === null) {
    skip("artifact integrity contracts", `${OUT_AUDIT} not found`);
    return;
  }

  check("the audit reports read-only", a.readOnly === true);
  check("the audit reports no training", a.trainingPerformed === false);
  check("the audit reports no generation", a.generationPerformed === false);
  check("the audit ran zero forward passes", a.modelForwardPasses === 0);
  check("the audit ran zero training steps", a.integrity.trainingStepsRun === 0);
  check("the audit wrote no checkpoint", a.integrity.checkpointsWritten === false);
  check(
    "the audit modified no production module",
    a.integrity.productionModulesModified.length === 0
  );
  check(
    "all checkpoints unchanged on disk",
    a.integrity.checkpointsUnchangedOnDisk
  );
  check("the audit declares no nondeterminism", a.usesMathRandom === false && a.usesSetTimeout === false);
}

// ============================================================
// 14-15 — Hypothesis measurement and the decision record
// ============================================================

function testDecisionRecord(a: AuditView | null, m: ManifestView | null): void {
  const p99 = readJson<Phase99View>(PHASE99_ARTIFACT);
  if (p99 === null) {
    skip("decision record contracts", `${PHASE99_ARTIFACT} not found`);
    return;
  }
  if (a === null) {
    skip("decision record contracts", `${OUT_AUDIT} not found`);
    return;
  }

  // 14. The baselines are READ from the Phase-99 artifact, not restated.
  const p2 = p99.bytePhaseAnalysis.failuresByPhase.find((p) => p.phase === "P2");
  check(
    "the recorded BASE corruption count equals the Phase-99 failure-state count",
    a.decision.baseCorruptionCount === p99.aggregate.auditedFailureStates,
    `artifact=${a.decision.baseCorruptionCount} phase99=${p99.aggregate.auditedFailureStates}`
  );
  check(
    "the recorded BASE P2 legal mass equals the Phase-99 measured value",
    p2 !== undefined && a.decision.baseP2LegalMass === p2.meanCompatibleMass,
    `artifact=${a.decision.baseP2LegalMass} phase99=${p2?.meanCompatibleMass}`
  );
  check(
    "the recorded BASE generation count equals the Phase-99 corpus size",
    a.failureStateOpeningAudit.length === p99.aggregate.auditedFailureStates
  );

  // 15. No MERGE-side number was invented.
  check("no MERGE corruption count was produced", a.decision.mergeCorruptionCount === null);
  check("no MERGE P2 legal mass was produced", a.decision.mergeP2LegalMass === null);
  check("the acceptance test was not reached", a.decision.acceptanceTestReached === false);
  check("the hypothesis was not tested", a.decision.tested === false);
  check(
    "the MERGE tokenizer state was not constructed",
    a.mergeTokenizerState.constructed === false &&
      a.mergeTokenizerState.changedMerges.length === 0
  );

  // The invariant check forbids treating the comparison as causal.
  check("the invariant check records that no MERGE variant exists", a.invariantCheck.mergeVariantExists === false);
  check("the invariant check declares the comparison inadmissible", a.invariantCheck.comparisonAdmissible === false);

  // The classification is the blocked one, and the letter is one of the
  // pre-registered A-E set.
  check(
    "the decision classification is E (Blocked)",
    a.decision.classification.startsWith("E"),
    a.decision.classification
  );
  check(
    "the classification statement is the blocked statement",
    a.decision.classificationStatement === "BLOCKED - frozen-checkpoint compatibility prevents merge-only test",
    a.decision.classificationStatement
  );

  // The artifact must not carry an A-D verdict for an experiment not run.
  check(
    "no supported/refuted/inconclusive verdict is claimed",
    !/strongly supported|partially supported|refuted|inconclusive/i.test(a.decision.classification)
  );

  // 16. Manifest consistency.
  if (m === null) {
    skip("manifest contracts", `${OUT_MANIFEST} not found`);
    return;
  }
  check("manifest status is BLOCKED", m.status === "BLOCKED", m.status);
  check(
    "manifest vocabulary size matches the measured tokenizer",
    m.vocabularySize === tokenizer().vocabSize,
    `manifest=${m.vocabularySize} measured=${tokenizer().vocabSize}`
  );
  check("manifest records no changed merges", m.changedMerges.length === 0);
  check("manifest records no constructed MERGE state", m.mergeTokenizerState.constructed === false);
  check(
    "manifest checkpoint hashes match the files on disk",
    m.checkpointIdentifiers.every((c) => {
      const abs = path.join(ROOT, c.path);
      return fs.existsSync(abs) && sha256File(abs) === c.sha256;
    }),
    m.checkpointIdentifiers.map((c) => c.path).join(" | ")
  );
  check(
    "manifest checkpoint list covers every frozen arm",
    m.checkpointIdentifiers.length === ARMS.filter((x) => fs.existsSync(x.checkpointPath)).length
  );
  check(
    "manifest blocking evidence matches the audit",
    m.blockingEvidence.addableMergesWithoutVocabularyChange ===
      a.addableMergesWithoutVocabularyChange &&
      m.blockingEvidence.failuresWhereInterventionApplies ===
        a.failureStateOpeningAudit.filter((f) => f.interventionApplies).length
  );
  check(
    "manifest records the frozen prompt set",
    m.promptSet.length === 5 && m.promptSet.every((p) => p.prompt.length > 0)
  );
}

// ============================================================
// Entry point
// ============================================================

export function runPhase100Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\n  -- Phase 100: CJK opening-token mechanism test --");

  const a = readJson<AuditView>(OUT_AUDIT);
  const m = readJson<ManifestView>(OUT_MANIFEST);
  if (a === null) {
    skip(
      "phase 100 artifacts",
      `${OUT_AUDIT} not found — run experiments/phase100/opening-token-audit.ts first`
    );
  }

  console.log("  [vocabulary compatibility]");
  testVocabularyCompatibility(a);
  console.log("  [merge table completeness]");
  testMergeTableCompleteness(a);
  console.log("  [failure-state opening contracts]");
  testFailureOpeningState(a);
  console.log("  [checkpoint compatibility]");
  testCheckpointCompatibility(a);
  console.log("  [determinism]");
  testDeterminism();
  console.log("  [frozen surfaces untouched]");
  testFrozenSurfacesUntouched();
  console.log("  [script and artifact integrity]");
  testScriptIntegrity(a);
  console.log("  [decision record]");
  testDecisionRecord(a, m);

  console.log(`  Phase 100: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}

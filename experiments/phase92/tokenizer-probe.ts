// ============================================================
// Phase 92 — Step 2: Tokenization-only probe
// ============================================================
// Measures candidate BPETokenizers on the FULL 600-doc bilingual
// corpus BEFORE any training. Question: does increasing the BPE
// merge budget (vocabSize − 260) improve Chinese tokenization
// granularity?
//
// Candidate matrix (vocabSize ↔ merge budget are coupled by
// `merges = vocabSize − 260` — verified in Step 0 audit):
//   A  vocab 300  merges  40  — EXACT Phase 90/91 production baseline
//   B  vocab 340  merges  80  — moderate increased merge budget (2×)
//   C  vocab 380  merges 120  — larger increased merge budget   (3×)
//
// For every candidate we measure (deterministically, seed 42):
//   - vocab size / merge count / deterministic state hash
//   - encode→decode round-trip status over all 600 samples
//   - average tokens per zh / en / mixed sample
//   - Chinese character/token ratio + % chars as 1 / 2 / 3+ tokens
//   - vocabulary utilization (tokens actually used in the corpus)
//   - deterministic reconstruction (train twice → same hash)
//
// A candidate that breaks round-trip correctness is REJECTED
// (never forwarded to training).
//
// Run: npx tsx experiments/phase92/tokenizer-probe.ts
// Output: experiments/phase92/tokenizer-probe-results.json
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  loadProductionDataset,
  getDatasetTexts,
  computeBaseStatistics,
  type LoadedDataset,
} from "../../src/lib/minimind/data/datasetLoader";
import { BPETokenizer } from "../../src/lib/minimind/tokenizer/BPETokenizer";
import { Random } from "../../src/lib/minimind/core/random/Random";

// ============================================================
// Fixed experiment constants
// ============================================================

const SEED = 42;

/** Candidate matrix — vocab target is the ONLY varying quantity. */
const CANDIDATES = [
  { key: "A", vocabTarget: 300, label: "baseline (production, merges=40)" },
  { key: "B", vocabTarget: 340, label: "moderate merge budget (merges=80)" },
  { key: "C", vocabTarget: 380, label: "larger merge budget (merges=120)" },
];

const OUT_DIR = path.resolve(__dirname);
const RESULT_PATH = path.join(OUT_DIR, "tokenizer-probe-results.json");

// ============================================================
// Types
// ============================================================

interface CandidateTokenizerMetrics {
  key: string;
  label: string;
  vocabTarget: number;
  actualVocabSize: number;
  mergeCount: number;
  /** Deterministic FNV-1a over the serialized tokenizer state. */
  stateHash: string;
  /** Training the same corpus+target twice yields the same hash. */
  deterministicReconstruction: boolean;
  /** Serialize → fromState → hash round-trip preserves the state. */
  stateRoundTrip: boolean;
  roundTrip: {
    allRoundTrip: boolean;
    failures: number;
  };
  tokens: {
    totalTokens: number;
    avgTokensZhSample: number;
    avgTokensEnSample: number;
    avgTokensMixedSample: number;
    minTokensPerSample: number;
    maxTokensPerSample: number;
  };
  chinese: {
    /** tokens per CJK character occurrence (weighted by frequency). */
    avgTokensPerCjkOccurrence: number;
    /** share of CJK occurrences that tokenize as a single token. */
    pctSingleToken: number;
    pctTwoToken: number;
    pctThreePlus: number;
    /** tokens / CJK chars over the 200 zh samples (whole-sample view). */
    tokensPerCharZhSamples: number;
    /** CJK chars per token over zh samples (higher = finer granularity). */
    cjkCharsPerTokenZhSamples: number;
  };
  vocabUtilization: {
    used: number;
    total: number;
    ratio: number;
  };
  accepted: boolean;
}

/** Corpus derivation statistics used to justify the candidate values. */
interface CorpusDerivation {
  distinctCjkChars: number;
  /** distinct CJK chars appearing >= 2 times (real merge candidates). */
  frequentCjkChars: number;
  /** 2 merges per char → budget that would single-tokenize every frequent char. */
  mergesForFullZhCoverage: number;
  zhChars: number;
  enChars: number;
  mixedChars: number;
}

// ============================================================
// Deterministic helpers
// ============================================================

/** FNV-1a 32-bit hash over a string (deterministic, no Math.random). */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Deterministic hash of the serialized tokenizer state. */
export function tokenizerStateHash(tokenizer: BPETokenizer): string {
  const state = tokenizer.toState();
  // merges are already rank-sorted by toState(); vocab key order is the
  // deterministic Map insertion order — stringify is stable per state.
  return fnv1a(JSON.stringify(state));
}

function isCjkCodePoint(code: number): boolean {
  return code >= 0x4e00 && code <= 0x9fff;
}

/** Count distinct CJK characters and their occurrence frequencies. */
function cjkCharFrequencies(texts: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const text of texts) {
    for (const ch of text) {
      if (isCjkCodePoint(ch.codePointAt(0) ?? 0)) {
        freq.set(ch, (freq.get(ch) ?? 0) + 1);
      }
    }
  }
  return freq;
}

// ============================================================
// Per-candidate measurement
// ============================================================

function analyzeCandidate(
  corpus: string[],
  samples: LoadedDataset["samples"],
  cand: (typeof CANDIDATES)[number]
): CandidateTokenizerMetrics {
  // ── Deterministic training (train twice → identical state) ──
  Random.setSeed(SEED);
  const t1 = new BPETokenizer();
  t1.train(corpus, cand.vocabTarget);
  const hash1 = tokenizerStateHash(t1);

  Random.setSeed(SEED);
  const t2 = new BPETokenizer();
  t2.train(corpus, cand.vocabTarget);
  const hash2 = tokenizerStateHash(t2);

  const deterministicReconstruction = hash1 === hash2;

  // ── Serialize → fromState round-trip ──
  let stateRoundTrip = true;
  try {
    const t3 = new BPETokenizer();
    t3.fromState(t1.toState());
    stateRoundTrip = tokenizerStateHash(t3) === hash1;
  } catch {
    stateRoundTrip = false;
  }

  // ── Round-trip over the full 600-doc corpus ──
  let roundTripFailures = 0;
  let totalTokens = 0;
  const tokenCounts: Record<string, number[]> = { zh: [], en: [], mixed: [] };
  for (const sample of samples) {
    const ids = t1.encode(sample.text);
    const roundTripped = t1.decode(ids) === sample.text;
    if (!roundTripped) roundTripFailures++;
    totalTokens += ids.length;
    tokenCounts[sample.language].push(ids.length);
  }

  // ── Chinese-character granularity (per occurrence, frequency-weighted) ──
  let single = 0;
  let two = 0;
  let threePlus = 0;
  let occurrenceCount = 0;
  let charTokenSum = 0;

  // Whole-zh-sample view: tokens / CJK chars.
  let zhTokens = 0;
  let zhCjkChars = 0;
  for (const sample of samples) {
    if (sample.language !== "zh") continue;
    const ids = t1.encode(sample.text);
    let cjkInSample = 0;
    for (const ch of sample.text) {
      if (isCjkCodePoint(ch.codePointAt(0) ?? 0)) {
        cjkInSample++;
        // per-occurrence tokenization of the character alone
        const n = t1.encode(ch).length;
        charTokenSum += n;
        occurrenceCount++;
        if (n === 1) single++;
        else if (n === 2) two++;
        else threePlus++;
      }
    }
    zhTokens += ids.length;
    zhCjkChars += cjkInSample;
  }

  const pct = (n: number) => (occurrenceCount > 0 ? n / occurrenceCount : 0);

  // ── Vocabulary utilization: tokens actually emitted by the corpus ──
  const used = new Set<number>();
  for (const sample of samples) {
    for (const id of t1.encode(sample.text)) used.add(id);
  }
  const vocabSize = t1.vocabSize;

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  return {
    key: cand.key,
    label: cand.label,
    vocabTarget: cand.vocabTarget,
    actualVocabSize: vocabSize,
    mergeCount: t1.toState().merges.length,
    stateHash: hash1,
    deterministicReconstruction,
    stateRoundTrip,
    roundTrip: {
      allRoundTrip: roundTripFailures === 0,
      failures: roundTripFailures,
    },
    tokens: {
      totalTokens,
      avgTokensZhSample: avg(tokenCounts.zh),
      avgTokensEnSample: avg(tokenCounts.en),
      avgTokensMixedSample: avg(tokenCounts.mixed),
      minTokensPerSample: Math.min(...samples.map((s) => t1.encode(s.text).length)),
      maxTokensPerSample: Math.max(...samples.map((s) => t1.encode(s.text).length)),
    },
    chinese: {
      avgTokensPerCjkOccurrence:
        occurrenceCount > 0 ? charTokenSum / occurrenceCount : 0,
      pctSingleToken: pct(single),
      pctTwoToken: pct(two),
      pctThreePlus: pct(threePlus),
      tokensPerCharZhSamples: zhCjkChars > 0 ? zhTokens / zhCjkChars : 0,
      cjkCharsPerTokenZhSamples:
        zhTokens > 0 ? zhCjkChars / zhTokens : 0,
    },
    vocabUtilization: {
      used: used.size,
      total: vocabSize,
      ratio: vocabSize > 0 ? used.size / vocabSize : 0,
    },
    accepted: roundTripFailures === 0,
  };
}

// ============================================================
// Main
// ============================================================

function main(): void {
  const dataset: LoadedDataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const base = computeBaseStatistics(dataset);

  // ── Corpus derivation for the candidate values ──
  const freq = cjkCharFrequencies(corpus);
  const distinctCjk = freq.size;
  let frequentCjk = 0;
  let zhChars = 0;
  let enChars = 0;
  let mixedChars = 0;
  for (const sample of dataset.samples) {
    if (sample.language === "zh") zhChars++;
    else if (sample.language === "en") enChars++;
    else mixedChars++;
  }
  for (const [, count] of freq) {
    if (count >= 2) frequentCjk++;
  }
  const derivation: CorpusDerivation = {
    distinctCjkChars: distinctCjk,
    frequentCjkChars: frequentCjk,
    mergesForFullZhCoverage: 2 * frequentCjk,
    zhChars,
    enChars,
    mixedChars,
  };

  const candidates = CANDIDATES.map((cand) =>
    analyzeCandidate(corpus, dataset.samples, cand)
  );

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = {
    phase: "phase92-tokenizer-probe",
    question:
      "Does increasing the BPE tokenizer merge budget improve Chinese tokenization granularity (fewer tokens per CJK character, more single-token characters)?",
    seed: SEED,
    dataset: {
      id: dataset.metadata.id,
      version: dataset.metadata.version,
      samples: dataset.samples.length,
      languageCounts: base.languageCounts,
    },
    couplingContract: {
      rule: "merges = vocabSize - 260 (256 byte tokens + 4 specials)",
      verifiedBy: "mergeCount == vocabTarget - 260 for every candidate",
    },
    corpusDerivation: derivation,
    candidates,
    acceptedCandidates: candidates.filter((c) => c.accepted).map((c) => c.key),
    rejectedCandidates: candidates.filter((c) => !c.accepted).map((c) => c.key),
  };

  fs.writeFileSync(RESULT_PATH, JSON.stringify(results, null, 2), "utf8");

  // ── Console report ──
  console.log("=== Phase 92 tokenizer-only probe ===");
  console.log(
    "dataset:",
    dataset.metadata.id,
    dataset.metadata.version,
    "| samples",
    dataset.samples.length
  );
  console.log("corpus CJK chars:", distinctCjk, "| frequent (>=2):", frequentCjk);
  console.log("merges for full zh coverage (2/chars):", derivation.mergesForFullZhCoverage);
  console.log("");
  for (const c of candidates) {
    console.log(
      `-- ${c.key} (vocab ${c.vocabTarget}, merges ${c.mergeCount}, hash ${c.stateHash}) --`
    );
    console.log("  roundTrip:", c.roundTrip.allRoundTrip, "| failures:", c.roundTrip.failures);
    console.log("  avgTokens/sample  zh:", c.tokens.avgTokensZhSample.toFixed(2),
      "en:", c.tokens.avgTokensEnSample.toFixed(2),
      "mixed:", c.tokens.avgTokensMixedSample.toFixed(2));
    console.log("  avg tokens/CJK occurrence:", c.chinese.avgTokensPerCjkOccurrence.toFixed(3),
      "| %1token:", (c.chinese.pctSingleToken * 100).toFixed(1),
      "%2:", (c.chinese.pctTwoToken * 100).toFixed(1),
      "%3+:", (c.chinese.pctThreePlus * 100).toFixed(1));
    console.log("  zh-sample tokens/char:", c.chinese.tokensPerCharZhSamples.toFixed(3),
      "| chars/token:", c.chinese.cjkCharsPerTokenZhSamples.toFixed(3));
    console.log("  vocab utilization:", c.vocabUtilization.used, "/", c.vocabUtilization.total,
      "=", (c.vocabUtilization.ratio * 100).toFixed(1) + "%");
    console.log("  deterministic:", c.deterministicReconstruction,
      "| stateRoundTrip:", c.stateRoundTrip,
      "| accepted:", c.accepted);
    console.log("");
  }
  console.log("results written:", path.basename(RESULT_PATH));
}

// Guarded so experiments/phase92/probe.ts can import tokenizerStateHash().
if (typeof require !== "undefined" && require.main === module) {
  main();
}

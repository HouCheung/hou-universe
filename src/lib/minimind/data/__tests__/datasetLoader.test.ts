// ============================================================
// Phase 82 — Dataset Loader / Schema Tests
// ============================================================
// Covers the single DatasetLoader: schema validation, duplicate
// rejection, language/split enforcement, deterministic base + token
// statistics, deterministic split, versioning, and JSONL support.
// ============================================================

import {
  loadProductionDataset,
  parseDataset,
  parseJsonlText,
  getDatasetTexts,
  computeBaseStatistics,
  computeDatasetStatistics,
} from "../datasetLoader";

import {
  DATASET_SCHEMA_VERSION,
  validateDatasetSample,
  validateDatasetMetadata,
  type DatasetMetadata,
} from "../datasetSchema";

import { getProductionTokenizer } from "../../tokenizer/tokenCounter";
import { bilingualCorpusTexts } from "../BilingualCorpus";

// ============================================================
// Harness
// ============================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
    );
  }
}

function assertThrows(fn: () => void, msg: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`Assertion failed: ${msg} (expected a throw)`);
}

// ============================================================
// Run
// ============================================================

export function runDatasetLoaderTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 82: Dataset Loader / Schema Tests --");

  testLoading();
  testMetadata();
  testSampleSchema();
  testBaseStatistics();
  testTokenStatistics();
  testDeterminism();
  testValidationFailures();
  testJsonl();

  console.log(`  Phase 82 (data): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Loading
// ============================================================

function testLoading(): void {
  test("loadProductionDataset returns a typed, non-empty dataset", () => {
    const ds = loadProductionDataset();
    assert(ds.samples.length > 0, "samples non-empty");
    assert(ds.metadata !== undefined, "metadata present");
    assertEqual(ds.samples.length, 600, "exactly 600 samples");
  });

  test("getDatasetTexts flattens to sample texts", () => {
    const ds = loadProductionDataset();
    const texts = getDatasetTexts(ds);
    assertEqual(texts.length, ds.samples.length, "one text per sample");
    assertEqual(texts[0], ds.samples[0].text, "texts preserve order");
    assert(texts.every((t) => typeof t === "string" && t.length > 0), "all non-empty");
  });

  test("corpus lives in the data file, not duplicated in TS", () => {
    // The deprecated BilingualCorpus shim must delegate to the SAME loader —
    // proving there is a single source of truth and no duplicated corpus.
    const viaLoader = getDatasetTexts(loadProductionDataset());
    const viaShim = bilingualCorpusTexts();
    assertEqual(viaLoader.length, viaShim.length, "same length");
    assertEqual(
      JSON.stringify(viaLoader),
      JSON.stringify(viaShim),
      "identical corpus from loader and shim"
    );
  });

  test("production corpus is a labeled seed, not a production-scale claim", () => {
    const ds = loadProductionDataset();
    assertEqual(ds.metadata.provenance, "internally-authored-seed", "provenance label");
    assert(ds.samples.length < 10_000, "small seed corpus (not production-scale)");
  });
}

// ============================================================
// Metadata
// ============================================================

function testMetadata(): void {
  test("metadata carries id/name/version/schemaVersion/purpose/coverage/provenance", () => {
    const m = loadProductionDataset().metadata;
    assertEqual(m.id, "bilingual", "id");
    assertEqual(m.name, "Bilingual Foundation", "name");
    assertEqual(m.version, "0.3.0", "version");
    assertEqual(m.schemaVersion, 1, "schemaVersion");
    assertEqual(m.schemaVersion, DATASET_SCHEMA_VERSION, "schemaVersion matches constant");
    assertEqual(m.purpose, "pretraining", "purpose");
    assertEqual(m.provenance, "internally-authored-seed", "provenance");
    assertEqual(
      JSON.stringify(m.languageCoverage),
      JSON.stringify(["zh", "en", "mixed"]),
      "languageCoverage"
    );
  });
}

// ============================================================
// Sample schema
// ============================================================

function testSampleSchema(): void {
  test("every sample has supported language and split", () => {
    const ds = loadProductionDataset();
    for (const s of ds.samples) {
      assert(["zh", "en", "mixed"].includes(s.language), `language ${s.language} valid`);
      assert(
        s.split === undefined || ["train", "validation", "test"].includes(s.split),
        `split ${s.split} valid`
      );
    }
  });

  test("every sample has a non-empty id and text", () => {
    const ds = loadProductionDataset();
    for (const s of ds.samples) {
      assert(typeof s.id === "string" && s.id.trim().length > 0, "id non-empty");
      assert(typeof s.text === "string" && s.text.trim().length > 0, "text non-empty");
    }
  });

  test("validateDatasetSample defaults split to train", () => {
    const sample = validateDatasetSample(
      { id: "x-1", language: "en", text: "hello" },
      0
    );
    assertEqual(sample.split, "train", "default split is train");
  });

  test("validateDatasetSample accepts optional source/category/quality", () => {
    const sample = validateDatasetSample(
      { id: "x-2", language: "zh", text: "你好", source: "seed", category: "general", quality: 1 },
      0
    );
    assertEqual(sample.source, "seed", "source");
    assertEqual(sample.category, "general", "category");
    assertEqual(sample.quality, 1, "quality");
  });
}

// ============================================================
// Base statistics
// ============================================================

function testBaseStatistics(): void {
  test("base statistics are exact and deterministic", () => {
    const base = computeBaseStatistics(loadProductionDataset());
    assertEqual(base.sampleCount, 600, "sampleCount");
    assertEqual(base.languageCounts.zh, 200, "zh count");
    assertEqual(base.languageCounts.en, 200, "en count");
    assertEqual(base.languageCounts.mixed, 200, "mixed count");
    assertEqual(base.splitCounts.train, 480, "train count");
    assertEqual(base.splitCounts.validation, 60, "validation count");
    assertEqual(base.splitCounts.test, 60, "test count");
  });

  test("base statistics sum consistently", () => {
    const base = computeBaseStatistics(loadProductionDataset());
    const lang = base.languageCounts;
    const split = base.splitCounts;
    assertEqual(lang.zh + lang.en + lang.mixed, base.sampleCount, "languages sum to total");
    assertEqual(
      split.train + split.validation + split.test,
      base.sampleCount,
      "splits sum to total"
    );
  });

  test("character and byte counts are positive and bytes >= characters", () => {
    const base = computeBaseStatistics(loadProductionDataset());
    assert(base.characterCount > 0, "characterCount positive");
    assert(base.byteCount > 0, "byteCount positive");
    assert(base.byteCount > base.characterCount, "UTF-8 bytes exceed chars for zh corpus");
  });

  test("split is deterministic (explicit metadata, no sampling)", () => {
    const a = computeBaseStatistics(loadProductionDataset());
    const b = computeBaseStatistics(loadProductionDataset());
    assertEqual(
      JSON.stringify(a.splitCounts),
      JSON.stringify(b.splitCounts),
      "split counts identical across runs"
    );
    assert(a.splitCounts.validation > 0 && a.splitCounts.test > 0, "explicit val/test splits present");
  });
}

// ============================================================
// Token statistics
// ============================================================

function testTokenStatistics(): void {
  test("token statistics use the REAL tokenizer, not a length heuristic", () => {
    const tokenizer = getProductionTokenizer();
    const ds = loadProductionDataset();
    const stats = computeDatasetStatistics(ds, tokenizer);

    // Independent recomputation with the same real tokenizer must match.
    const expected = ds.samples.reduce(
      (sum, s) => sum + tokenizer.encode(s.text).length,
      0
    );
    assertEqual(stats.tokenCount, expected, "tokenCount equals sum of real encode lengths");
  });

  test("Chinese samples are NOT undercounted by `length / 4`", () => {
    const tokenizer = getProductionTokenizer();
    const zh = loadProductionDataset().samples.find((s) => s.language === "zh")!;
    const real = tokenizer.encode(zh.text).length;
    const heuristic = Math.ceil(zh.text.length / 4);
    assert(real > heuristic, `Chinese real=${real} must exceed /4 heuristic=${heuristic}`);
  });

  test("token statistics bounds are consistent", () => {
    const tokenizer = getProductionTokenizer();
    const stats = computeDatasetStatistics(loadProductionDataset(), tokenizer);
    assert(stats.tokenCount > 0, "tokenCount positive");
    assert(stats.minTokensPerSample > 0, "min tokens positive");
    assert(stats.maxTokensPerSample >= stats.minTokensPerSample, "max >= min");
    assert(stats.averageTokensPerSample > 0, "avg positive");
    assert(stats.averageTokensPerSample <= stats.maxTokensPerSample, "avg <= max");
  });
}

// ============================================================
// Determinism
// ============================================================

function testDeterminism(): void {
  test("full statistics are deterministic across repeated computations", () => {
    const tokenizer = getProductionTokenizer();
    const ds = loadProductionDataset();
    const a = computeDatasetStatistics(ds, tokenizer);
    const b = computeDatasetStatistics(ds, tokenizer);
    assertEqual(JSON.stringify(a), JSON.stringify(b), "identical statistics");
  });

  test("loading twice returns identical parsed samples", () => {
    const a = loadProductionDataset();
    const b = loadProductionDataset();
    assertEqual(a.samples.length, b.samples.length, "same length");
    assertEqual(
      JSON.stringify(getDatasetTexts(a)),
      JSON.stringify(getDatasetTexts(b)),
      "identical corpus"
    );
  });
}

// ============================================================
// Validation failures (invalid datasets fail explicitly)
// ============================================================

function testValidationFailures(): void {
  test("parseDataset rejects duplicate sample ids", () => {
    assertThrows(
      () =>
        parseDataset(
          {
            metadata: validMetadata(),
            samples: [
              { id: "a", language: "en", text: "one" },
              { id: "a", language: "zh", text: "二" },
            ],
          },
          "test"
        ),
      "duplicate id must throw"
    );
  });

  test("parseDataset rejects unsupported language", () => {
    assertThrows(
      () =>
        parseDataset(
          { metadata: validMetadata(), samples: [{ id: "a", language: "fr", text: "bonjour" }] },
          "test"
        ),
      "unsupported language must throw"
    );
  });

  test("parseDataset rejects unsupported split", () => {
    assertThrows(
      () =>
        parseDataset(
          {
            metadata: validMetadata(),
            samples: [{ id: "a", language: "en", text: "one", split: "dev" }],
          },
          "test"
        ),
      "unsupported split must throw"
    );
  });

  test("parseDataset rejects empty id and empty text", () => {
    assertThrows(
      () =>
        parseDataset(
          { metadata: validMetadata(), samples: [{ id: "", language: "en", text: "one" }] },
          "test"
        ),
      "empty id must throw"
    );
    assertThrows(
      () =>
        parseDataset(
          { metadata: validMetadata(), samples: [{ id: "a", language: "en", text: "  " }] },
          "test"
        ),
      "empty text must throw"
    );
  });

  test("validateDatasetMetadata rejects schema version mismatch", () => {
    assertThrows(
      () =>
        validateDatasetMetadata({
          id: "x",
          name: "X",
          version: "1.0.0",
          schemaVersion: 999,
          purpose: "pretraining",
          languageCoverage: ["en"],
          provenance: "seed",
        }),
      "schema version mismatch must throw"
    );
  });
}

// ============================================================
// JSONL support
// ============================================================

function testJsonl(): void {
  test("parseJsonlText parses valid lines into samples", () => {
    const text =
      '{"id":"a","language":"en","text":"hello"}\n' +
      '{"id":"b","language":"zh","text":"你好"}\n';
    const ds = parseJsonlText(text, validMetadata(), "test.jsonl");
    assertEqual(ds.samples.length, 2, "two samples parsed");
    assertEqual(ds.samples[0].id, "a", "first id");
  });

  test("parseJsonlText rejects malformed lines", () => {
    assertThrows(
      () => parseJsonlText('{"id":"a","language":"en","text":', validMetadata(), "test.jsonl"),
      "malformed JSONL must throw"
    );
  });

  test("parseJsonlText skips blank and comment lines", () => {
    const text = '# header\n\n{"id":"a","language":"en","text":"hi"}\n';
    const ds = parseJsonlText(text, validMetadata(), "test.jsonl");
    assertEqual(ds.samples.length, 1, "only the real line parsed");
  });
}

// ============================================================
// Helpers
// ============================================================

function validMetadata(): DatasetMetadata {
  return {
    id: "test",
    name: "Test",
    version: "1.0.0",
    schemaVersion: DATASET_SCHEMA_VERSION,
    purpose: "pretraining",
    languageCoverage: ["en"],
    provenance: "seed",
  };
}

// ============================================================
// Standalone runner
// ============================================================

const isMainModule = process.argv.length >= 2 && process.argv[1]?.includes("datasetLoader.test");
if (isMainModule) {
  const result = runDatasetLoaderTests();
  if (result.failed > 0) process.exit(1);
}

// ============================================================
// Phase 76 — AI Lab Product Experience: i18n invariant tests
// ============================================================
// Verifies the product-facing invariants introduced by Phase 76:
//   1. en / zh-CN locale parity for the aiLab.chat namespace
//      (every visible string is translated — no English-only keys)
//   2. The new Phase 76 keys exist and are non-empty in both
//      locales (model status, MiniMind prompts, train CTA, narrative)
//
// Run with: npx tsx src/lib/minimind/__tests__/phase76-product.test.ts
// ============================================================

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ============================================================
// Locale loading (resolved relative to this file, not cwd)
// ============================================================

interface LocaleRecord {
  [key: string]: string | LocaleRecord;
}

function loadLocale(relativePath: string): LocaleRecord {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as LocaleRecord;
}

const en = loadLocale("../../../lib/i18n/locales/en.json");
const zh = loadLocale("../../../lib/i18n/locales/zh-CN.json");

// ============================================================
// Helpers
// ============================================================

function getNamespace(locale: LocaleRecord, path: string[]): LocaleRecord | null {
  let node: LocaleRecord | string = locale;
  for (const segment of path) {
    if (typeof node === "string" || node === null || node === undefined) return null;
    node = node[segment];
  }
  return typeof node === "string" ? null : (node as LocaleRecord);
}

/** Collect every leaf key path under a node, as dot-joined strings. */
function collectLeafKeys(node: LocaleRecord, prefix: string): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(node)) {
    const value = node[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(fullKey);
    } else {
      keys.push(...collectLeafKeys(value, fullKey));
    }
  }
  return keys;
}

function readLeaf(locale: LocaleRecord, dotPath: string): string | null {
  let node: LocaleRecord | string = locale;
  for (const segment of dotPath.split(".")) {
    if (typeof node === "string" || node === null || node === undefined) return null;
    node = node[segment];
  }
  return typeof node === "string" ? node : null;
}

// ============================================================
// Test result tracking
// ============================================================

interface TestResult {
  passed: number;
  failed: number;
}

function check(condition: boolean, label: string, result: TestResult): void {
  if (condition) {
    result.passed++;
  } else {
    result.failed++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

// ============================================================
// Tests
// ============================================================

export function runPhase76Tests(): TestResult {
  const result: TestResult = { passed: 0, failed: 0 };

  console.log("\nPhase 76 — AI Lab Product i18n tests");

  // ── 1. aiLab.chat namespace parity (en vs zh) ──
  const enChat = getNamespace(en, ["aiLab", "chat"]);
  const zhChat = getNamespace(zh, ["aiLab", "chat"]);

  check(enChat !== null, "en has aiLab.chat namespace", result);
  check(zhChat !== null, "zh-CN has aiLab.chat namespace", result);

  if (enChat && zhChat) {
    const enKeys = collectLeafKeys(enChat, "aiLab.chat");
    const zhKeys = collectLeafKeys(zhChat, "aiLab.chat");
    const enSet = new Set(enKeys);
    const zhSet = new Set(zhKeys);

    const missingInZh = enKeys.filter((k) => !zhSet.has(k));
    const missingInEn = zhKeys.filter((k) => !enSet.has(k));

    check(missingInZh.length === 0, `zh-CN missing ${missingInZh.length} key(s): ${missingInZh.join(", ") || "none"}`, result);
    check(missingInEn.length === 0, `en missing ${missingInEn.length} key(s): ${missingInEn.join(", ") || "none"}`, result);

    // ── 2. No empty values in either locale ──
    const emptyValues: string[] = [];
    for (const key of enKeys) {
      const v = readLeaf(en, key);
      if (v === null || v.trim().length === 0) emptyValues.push(`en:${key}`);
    }
    for (const key of zhKeys) {
      const v = readLeaf(zh, key);
      if (v === null || v.trim().length === 0) emptyValues.push(`zh:${key}`);
    }
    check(emptyValues.length === 0, `No empty locale values (found ${emptyValues.length})`, result);
  }

  // ── 3. Specific Phase 76 keys present & non-empty ──
  const REQUIRED_KEYS = [
    "aiLab.chat.trainCheckpoint",
    "aiLab.chat.openLab",
    "aiLab.chat.newChat",
    "aiLab.chat.status.untrained",
    "aiLab.chat.status.trained",
    "aiLab.chat.status.training",
    "aiLab.chat.status.generating",
    "aiLab.chat.welcome.trainCheckpointCta",
    "aiLab.chat.welcome.prompts.explainMiniMind",
    "aiLab.chat.welcome.prompts.attention",
    "aiLab.chat.welcome.prompts.pythonExample",
    "aiLab.chat.welcome.prompts.whatAmILookingAt",
    "aiLab.chat.lab.narrative",
  ];

  for (const key of REQUIRED_KEYS) {
    const enValue = readLeaf(en, key);
    const zhValue = readLeaf(zh, key);
    check(
      enValue !== null && enValue.trim().length > 0 &&
      zhValue !== null && zhValue.trim().length > 0,
      `${key} present in both locales`,
      result
    );
  }

  console.log(
    `\nPhase 76 i18n tests: ${result.passed} passed, ${result.failed} failed`
  );

  return result;
}

// ============================================================
// Standalone entry point (npx tsx <this-file>)
// ============================================================

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const result = runPhase76Tests();
  if (result.failed > 0) {
    process.exit(1);
  }
}

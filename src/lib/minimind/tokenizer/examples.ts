// ============================================================
// MiniMind — examples.ts
// ============================================================
// MiniTokenizer.explain() 使用示例
//
// 本文件演示 explain API 在不同场景下的行为。
// 可直接使用 tsx / ts-node 运行，或复制到 Playground 中测试。
// ============================================================

import { MiniTokenizer } from "./MiniTokenizer";

/**
 * 辅助函数：格式化打印 ExplainResult
 */
function printExplain(label: string, text: string): void {
  const tokenizer = new MiniTokenizer();

  // 注册示例词汇
  tokenizer.addToken("hello");
  tokenizer.addToken("world");
  tokenizer.addToken("mini");
  tokenizer.addToken("mind");
  tokenizer.addToken("tokenizer");
  tokenizer.addToken("the");
  tokenizer.addToken("is");
  tokenizer.addToken("a");
  tokenizer.addToken("powerful");
  tokenizer.addToken("tool");
  tokenizer.addToken("I");
  tokenizer.addToken("love");
  tokenizer.addToken("machine");
  tokenizer.addToken("learning");

  const result = tokenizer.explain(text);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  originalText  : "${result.originalText}"`);
  console.log(`  decoded       : "${result.decoded}"`);
  console.log(`  encoded       : [${result.encoded.join(", ")}]`);
  console.log(`  unknownTokens : [${result.unknownTokens.join(", ")}]`);
  console.log(`  tokens:`);
  for (const t of result.tokens) {
    const status = t.exists ? "✓" : "✗ (unknown)";
    console.log(`    ${status}  token="${t.token}"  id=${t.id}`);
  }
}

// ============================================================
// 示例 1：普通句子 — 所有 token 都已注册
// ============================================================
printExplain(
  "示例 1：普通句子（全部已知）",
  "hello world"
);

// ============================================================
// 示例 2：包含未知 token
// ============================================================
printExplain(
  "示例 2：包含未知 token",
  "hello unknown world"
);

// ============================================================
// 示例 3：全部未知 — 所有 token 都不在 vocabulary 中
// ============================================================
printExplain(
  "示例 3：全部未知",
  "foo bar baz"
);

// ============================================================
// 示例 4：包含特殊 token 的句子
// ============================================================
printExplain(
  "示例 4：技术词汇",
  "mini mind tokenizer is a powerful tool"
);

// ============================================================
// 示例 5：空字符串
// ============================================================
printExplain(
  "示例 5：空字符串",
  ""
);

// ============================================================
// 示例 6：addSpecialTokens 模式
// ============================================================
function printExplainWithSpecials(label: string, text: string): void {
  const tokenizer = new MiniTokenizer({ addSpecialTokens: true });
  tokenizer.addToken("hello");
  tokenizer.addToken("world");

  const result = tokenizer.explain(text);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  originalText  : "${result.originalText}"`);
  console.log(`  decoded       : "${result.decoded}"`);
  console.log(`  encoded       : [${result.encoded.join(", ")}]`);
  console.log(`  tokens:`);
  for (const t of result.tokens) {
    const status = t.exists ? "✓" : "✗ (unknown)";
    console.log(`    ${status}  token="${t.token}"  id=${t.id}`);
  }
}

printExplainWithSpecials(
  "示例 6：addSpecialTokens 模式",
  "hello world"
);

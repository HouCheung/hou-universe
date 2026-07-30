// ============================================================
// MiniMind — experiments/runners/TokenizerComparisonRunner.ts
// ============================================================
// Tokenizer Comparison Runner — 实验 1
//
// 核心功能：
//   对比 MiniTokenizer（词级）和 CharacterTokenizer（字符级）
//   对同一输入文本的分词结果，计算 token 数量、未知率、
//   往返保真度等对比指标。
//
// 依赖模块：
//   - MiniTokenizer（词级分词器）
//   - CharacterTokenizer（字符级分词器，来自 ExperimentContext 工厂）
//
// 设计原则：
//   - 单一职责 — 仅负责分词对比逻辑
//   - 优雅降级 — 每个分词器独立 try/catch
//   - 零核心模块修改 — 所有依赖通过 context 注入
//   - 与 ForwardVisualAdapter 对齐 — 单一入口 + 私有 helper
// ============================================================

import type {
  ExperimentRunner,
  ExperimentResult,
  ExperimentContext,
  TokenizerComparisonInput,
  TokenizerComparisonData,
  TokenizerRunSummary,
  TokenizerComparisonMetrics,
} from "../types";
import { registerRunner } from "../ExperimentRunner";

// ============================================================
// TokenizerComparisonRunner
// ============================================================

/**
 * TokenizerComparisonRunner — 对比两种分词策略的实验运行器
 *
 * 实验流程：
 *   1. 校验 context 中的 tokenizer 和 charTokenizer 非空
 *   2. 对输入文本分别运行两个分词器
 *   3. 收集每个分词器的 tokenize/encode/decode 结果
 *   4. 计算对比指标（token 数量比、未知率、往返保真度）
 *   5. 包装为 ExperimentResult<TokenizerComparisonData>
 *
 * 使用方式：
 *   const runner = new TokenizerComparisonRunner();
 *   const result = runner.run(context, { text: "Hello World" });
 */
export class TokenizerComparisonRunner
  implements ExperimentRunner<TokenizerComparisonInput, TokenizerComparisonData>
{
  readonly experimentId = "tokenizer-comparison-lab";

  // ============================================================
  // 公开 API — run
  // ============================================================

  /**
   * run(context, input) — 执行分词对比实验
   *
   * @param context — 实验上下文（需含 tokenizer + charTokenizer）
   * @param input   — { text: string }
   * @returns         ExperimentResult<TokenizerComparisonData>
   */
  run(
    context: ExperimentContext,
    input: TokenizerComparisonInput
  ): ExperimentResult<TokenizerComparisonData> {
    const startMs = performance.now();
    const errors: ExperimentResult["errors"] = [];

    // ── 校验：输入文本 ──
    if (!input.text || input.text.trim().length === 0) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "Input text is empty. Provide non-empty text for tokenizer comparison.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    // ── 校验：必需模块 ──
    if (!context.tokenizer) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "MiniTokenizer is not available in the experiment context.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    if (!context.charTokenizer) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "CharacterTokenizer is not available in the experiment context.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    // ── 运行：MiniTokenizer ──
    let miniResult: TokenizerRunSummary | null = null;
    try {
      miniResult = this.runTokenizer(
        "MiniTokenizer (word-level)",
        context.tokenizer,
        input.text
      );
    } catch (err) {
      errors.push({
        phase: "mini-tokenizer",
        message: "MiniTokenizer failed during comparison.",
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 运行：CharacterTokenizer ──
    let charResult: TokenizerRunSummary | null = null;
    try {
      charResult = this.runTokenizer(
        "CharacterTokenizer (char-level)",
        context.charTokenizer,
        input.text
      );
    } catch (err) {
      errors.push({
        phase: "char-tokenizer",
        message: "CharacterTokenizer failed during comparison.",
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 判断状态 ──
    const endMs = performance.now();
    const timing = { startMs, endMs, durationMs: endMs - startMs };

    if (!miniResult || !charResult) {
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors,
        timing,
      };
    }

    const hasErrors = errors.length > 0;

    // ── 计算对比指标 ──
    const comparison = this.computeComparisonMetrics(miniResult, charResult);

    return {
      experimentId: this.experimentId,
      status: hasErrors ? "partial" : "success",
      data: {
        inputText: input.text,
        miniTokenizer: miniResult,
        charTokenizer: charResult,
        comparison,
      },
      errors,
      timing,
    };
  }

  // ============================================================
  // 私有 helper — 运行单个分词器
  // ============================================================

  /**
   * runTokenizer(name, tokenizer, text) — 对单个分词器运行完整流程
   *
   * 调用 tokenize() → encode() → decode()，
   * 收集所有结果并统计未知 token 数量。
   *
   * @param name      — 分词器名称（用于结果标注）
   * @param tokenizer — 分词器实例（MiniTokenizer 或 CharacterTokenizer）
   * @param text      — 输入文本
   * @returns          分词器运行摘要
   */
  private runTokenizer(
    name: string,
    tokenizer: {
      tokenize(text: string): string[];
      encode(text: string): number[];
      decode(ids: number[]): string;
      getVocabulary(): { size: number; tokenToId: ReadonlyMap<string, number> };
    },
    text: string
  ): TokenizerRunSummary {
    const tokens = tokenizer.tokenize(text);
    const tokenIds = tokenizer.encode(text);
    const decoded = tokenizer.decode(tokenIds);
    const vocab = tokenizer.getVocabulary();

    // 统计未知 token 数量
    // MiniTokenizer 将未知词映射为 "<unk>"，CharacterTokenizer 无未知概念
    const unknownCount = tokens.filter((t) => t === "<unk>").length;

    return {
      tokenizerName: name,
      tokens,
      tokenIds,
      decoded,
      vocabSize: vocab.size,
      unknownCount,
      tokenCount: tokens.length,
    };
  }

  // ============================================================
  // 私有 helper — 计算对比指标
  // ============================================================

  /**
   * computeComparisonMetrics(mini, char) — 计算两种分词器的对比指标
   *
   * 指标说明：
   *   - tokenRatio = charTokenCount / miniTokenCount
   *     值 > 1 表示字符级分词产生的 token 更多（更细粒度）
   *     值 ≈ 平均词长（英文约为 5-6）
   *   - miniUnknownRate = miniUnknownCount / miniTokenCount
   *     词级分词器无法识别词汇的比例
   *   - charUnknownRate = charUnknownCount / charTokenCount
   *     字符级分词几乎总是 0（单个字符不会"未知"）
   *
   * @param mini — MiniTokenizer 运行结果
   * @param char — CharacterTokenizer 运行结果
   * @returns      对比指标
   */
  private computeComparisonMetrics(
    mini: TokenizerRunSummary,
    char: TokenizerRunSummary
  ): TokenizerComparisonMetrics {
    const miniTokenCount = mini.tokenCount;
    const charTokenCount = char.tokenCount;

    return {
      miniTokenCount,
      charTokenCount,
      tokenRatio:
        miniTokenCount > 0 ? charTokenCount / miniTokenCount : 0,
      miniUnknownRate:
        miniTokenCount > 0 ? mini.unknownCount / miniTokenCount : 0,
      charUnknownRate:
        charTokenCount > 0 ? char.unknownCount / charTokenCount : 0,
    };
  }
}

// ============================================================
// 注册 runner
// ============================================================

registerRunner(new TokenizerComparisonRunner());

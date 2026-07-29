// ============================================================
// MiniMind — comparison.ts
// ============================================================
// Learning Edition vs MiniMind Tokenizer 功能对比
//
// 本文件定义两组功能矩阵，用于展示当前教育版 tokenizer
// 与目标 MiniMind tokenizer 之间的能力差异和演进路径。
//
// 数据来源：
//   src/data/minimind/tokenizer-registry.ts (ALL_TOKENIZER_FEATURES)
//
// 所有 feature 数据由 tokenizer-registry 统一管理。
// 本文件仅负责按 view tag 构建两个衍生视图，
// 不独立维护任何 feature 数据。
//
// 使用场景：
//   - AI Lab 文档页面渲染 feature comparison 表格
//   - Playground 展示"下一步将支持"的功能列表
//   - 项目路线图可视化（roadmap integration）
// ============================================================

import {
  type TokenizerFeature,
  type TaggedTokenizerFeature,
  ALL_TOKENIZER_FEATURES,
} from "@/data/minimind/tokenizer-registry";

// Re-export the TokenizerFeature type for backward compatibility
export type { TokenizerFeature };

/**
 * EducationalTokenizerFeatures
 *
 * Learning Edition（当前 V1 MiniTokenizer）的功能矩阵。
 *
 * 定位：教学用的最简单 Word Tokenizer，用于：
 *   - 理解 tokenization 的核心概念
 *   - 可视化 token → id 映射
 *   - 作为 playground 的交互式教学工具
 *
 * 数据来源：tokenizer-registry 中 view === "educational" 的 feature。
 */
export const EducationalTokenizerFeatures: TokenizerFeature[] =
  deriveFeatures("educational");

/**
 * MiniMindTokenizerFeatures
 *
 * MiniMind 目标 tokenizer 的功能矩阵。
 *
 * 定位：接近 GPT-2/GPT-4 tokenizer 的生产级实现，用于：
 *   - MiniMind 模型的训练和推理
 *   - 作为 Learning Edition 的"毕业目标"
 *   - 展示从简单到复杂的完整演进路径
 *
 * 当前所有功能均为 planned，尚未实现。
 * 实现路径遵循 Architecture Evolution：
 *   Word → Character → BPE → Byte-Level BPE → MiniMind Compatible
 *
 * 数据来源：tokenizer-registry 中 view === "minimind" 的 feature。
 */
export const MiniMindTokenizerFeatures: TokenizerFeature[] =
  deriveFeatures("minimind");

// ============================================================
// Derivation helpers
// ============================================================

/**
 * Derive a feature array from the canonical registry by view tag.
 *
 * This is the ONLY place that constructs the two comparison views.
 * When features are added/updated in the registry, both arrays
 * automatically reflect the changes — no manual sync needed.
 */
function deriveFeatures(view: TaggedTokenizerFeature["view"]): TokenizerFeature[] {
  return ALL_TOKENIZER_FEATURES
    .filter((f) => f.view === view)
    .map(({ feature, supported, plannedVersion, notes }) => ({
      feature,
      supported,
      plannedVersion,
      notes,
    }));
}

/**
 * 辅助函数：获取当前已支持的功能列表
 */
export function getSupportedFeatures(
  features: TokenizerFeature[]
): TokenizerFeature[] {
  return features.filter((f) => f.supported);
}

/**
 * 辅助函数：获取规划中但尚未支持的功能列表
 */
export function getPlannedFeatures(
  features: TokenizerFeature[]
): TokenizerFeature[] {
  return features.filter((f) => !f.supported);
}

/**
 * 辅助函数：按版本号分组功能
 */
export function getFeaturesByVersion(
  features: TokenizerFeature[]
): Map<string | null, TokenizerFeature[]> {
  const map = new Map<string | null, TokenizerFeature[]>();
  for (const f of features) {
    const key = f.plannedVersion;
    const existing = map.get(key);
    if (existing) {
      existing.push(f);
    } else {
      map.set(key, [f]);
    }
  }
  return map;
}

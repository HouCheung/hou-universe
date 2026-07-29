// ============================================================
// MiniMind — pipeline.ts
// ============================================================
// TokenizerPipeline 及 PipelineStep 数据结构
//
// 本文件定义 V1 Word Tokenizer 的完整处理流水线，
// 并为未来版本预留扩展空间。
//
// 数据来源：
//   src/data/minimind/tokenizer-registry.ts (getV1PipelineStages)
//
// Pipeline stage 数据由 tokenizer-registry 统一管理。
// 本文件负责将 registry 中的 PipelineStageDef 映射为
// 使用 TokenizerStage 枚举的 PipelineStep 结构，
// 不独立维护任何 stage 数据。
//
// 设计原则：
//   - 每个步骤独立描述，可单独追踪实现状态
//   - 通过 futureVersion 标记尚未实现的步骤
//   - 新增步骤无需修改已有接口
// ============================================================

import { TokenizerStage } from "./stages";
import { getV1PipelineStages } from "@/data/minimind/tokenizer-registry";
import type { PipelineStageDef } from "@/data/minimind/tokenizer-registry";

/**
 * PipelineStep — 流水线中的单个处理步骤
 *
 * 每个步骤描述 tokenization 流程中的一个阶段。
 * 未实现的步骤通过 implemented: false 和 futureVersion 标记。
 *
 * 示例（V1）：
 *   { id: "split", title: "Whitespace Split", implemented: true }
 *
 * 示例（V2 预约）：
 *   { id: "bpe-merge", title: "BPE Merge", implemented: false, futureVersion: "V2" }
 */
export interface PipelineStep {
  /** 步骤唯一标识，对应 TokenizerStage 枚举值 */
  id: TokenizerStage;

  /** 人类可读的步骤标题 */
  title: string;

  /** 步骤的简短描述 */
  description: string;

  /** 当前版本是否已实现 */
  implemented: boolean;

  /**
   * 计划实现的版本号。
   * 为 null 表示尚未规划；非 null 表示已列入该版本的路线图。
   */
  futureVersion: string | null;
}

// ============================================================
// Stage id → TokenizerStage enum mapping
// ============================================================

/**
 * Map a string stage id from the registry to the TokenizerStage enum.
 *
 * Only the 5 currently-defined stages are mapped.
 * Future stages (ByteEncoding, BPEMerge, SentencePiece) will be
 * added here when their enum members are un-commented in stages.ts.
 */
const STAGE_ID_MAP: Record<string, TokenizerStage> = {
  normalize: TokenizerStage.Normalize,
  split: TokenizerStage.Split,
  lookup: TokenizerStage.Lookup,
  encode: TokenizerStage.Encode,
  decode: TokenizerStage.Decode,
};

function toPipelineStep(def: PipelineStageDef): PipelineStep {
  const id = STAGE_ID_MAP[def.id];
  if (id === undefined) {
    throw new Error(
      `[pipeline] Unknown stage id "${def.id}". ` +
        `Add it to stages.ts and the STAGE_ID_MAP in pipeline.ts.`
    );
  }
  return {
    id,
    title: def.title,
    description: def.description,
    implemented: def.implemented,
    futureVersion: def.futureVersion,
  };
}

/**
 * TokenizerPipeline
 *
 * V1 处理流水线的完整定义。
 * 顺序固定：Normalize → Split → Lookup → Encode → Decode
 *
 * 当前版本（V1）实现：
 *   - Split（空白切分）
 *   - Lookup（Vocabulary 查表）
 *   - Encode（token → id 映射）
 *   - Decode（id → token 还原）
 *
 * 未来版本计划：
 *   - V2：Normalize（标点处理、大小写归一化）
 *   - V3：ByteEncoding（字节级编码）
 *   - V4：BPEMerge（BPE 合并）
 *   - V5：SentencePiece（Unigram 子词模型）
 *
 * 数据来源：tokenizer-registry → getV1PipelineStages()
 */
export const TokenizerPipeline: PipelineStep[] =
  getV1PipelineStages().map(toPipelineStep);

/**
 * 辅助函数：获取当前已实现的步骤
 */
export function getImplementedSteps(): PipelineStep[] {
  return TokenizerPipeline.filter((step) => step.implemented);
}

/**
 * 辅助函数：获取规划中但尚未实现的步骤
 */
export function getPlannedSteps(): PipelineStep[] {
  return TokenizerPipeline.filter((step) => !step.implemented);
}

/**
 * 辅助函数：按 stage id 查找步骤
 */
export function getStepByStage(stage: TokenizerStage): PipelineStep | undefined {
  return TokenizerPipeline.find((step) => step.id === stage);
}

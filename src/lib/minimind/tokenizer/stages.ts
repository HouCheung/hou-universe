// ============================================================
// MiniMind — stages.ts
// ============================================================
// TokenizerStage 枚举定义
//
// 定义 tokenization 流水线中所有可能的处理阶段。
// 当前枚举覆盖 V1 Word Tokenizer 的五个阶段，
// 并为未来版本预留扩展槽位。
//
// 设计约束：
//   - 新增阶段仅需追加枚举成员，不影响已有代码
//   - 每个阶段通过 PipelineStep 追踪实现状态
//   - 下游消费者（如 Playground / AI Lab）可安全使用此枚举
// ============================================================

/**
 * TokenizerStage — tokenization 流水线阶段枚举
 *
 * 使用字符串枚举以保证序列化友好，
 * 下游消费者可直接将枚举值用于 UI 展示和路由。
 *
 * ================================
 * 当前版本（V1）已实现：
 * ================================
 *   Split   — 空白切分
 *   Lookup  — Vocabulary 查表
 *   Encode  — token → id 编码
 *   Decode  — id → token 解码
 *
 * ================================
 * 计划增加（无需修改本枚举）：
 * ================================
 *   Normalize      — 文本归一化（V2）
 *   ByteEncoding   — UTF-8 字节编码（V3）
 *   BPEMerge       — BPE 合并（V4）
 *   SentencePiece  — Unigram 子词模型（V5）
 *
 * 新增阶段时只需追加枚举成员，
 * 并在 pipeline.ts 中添加对应 PipelineStep 即可。
 */
export enum TokenizerStage {
  /**
   * Normalize — 文本归一化
   *
   * 职责：去除首尾空白、统一 Unicode 表示形式、
   * 标点分离、大小写归一化。
   *
   * 状态：计划 V2 实现
   */
  Normalize = "normalize",

  /**
   * Split — 文本切分
   *
   * 职责：将归一化后的文本切分为初始 token 序列。
   * V1 使用空白切分；未来版本可在 ByteEncoding 后
   * 对字节序列进行拆分。
   *
   * 状态：V1 已实现（Whitespace Split）
   */
  Split = "split",

  /**
   * Lookup — 词汇查表
   *
   * 职责：将每个 token 映射到 vocabulary 中的 id。
   * V1 使用精确匹配；子词模型中改为最长前缀匹配。
   *
   * 状态：V1 已实现（Exact Match）
   */
  Lookup = "lookup",

  /**
   * Encode — 编码
   *
   * 职责：将 token 序列转换为 id 序列。
   * 可选附加 special token（<bos>/<eos>）。
   *
   * 状态：V1 已实现
   */
  Encode = "encode",

  /**
   * Decode — 解码
   *
   * 职责：将 id 序列还原为文本。
   * V1 用空格拼接 token；Byte-Level 版本需从字节重建文本。
   *
   * 状态：V1 已实现
   */
  Decode = "decode",

  // ============================================================
  // 未来版本预留
  // ============================================================
  // 以下枚举成员标记为 @future，当前不在 pipeline 中激活。
  // 实现时取消注释并在 pipeline.ts 中添加对应 PipelineStep。
  // ============================================================

  /**
   * ByteEncoding — UTF-8 字节编码
   *
   * 将文本转换为 UTF-8 字节序列（0-255），
   * 使 vocabulary 大小恒定且能表示任意 Unicode 文本。
   *
   * 状态：计划 V3 实现
   */
  // ByteEncoding = "byte-encoding",

  /**
   * BPEMerge — BPE 合并
   *
   * 基于 merge rules 将字节/字符对迭代合并为子词 token。
   * 核心算法：统计最高频相邻对 → 合并 → 重复直到 vocabulary 达到目标大小。
   *
   * 状态：计划 V4 实现
   */
  // BPEMerge = "bpe-merge",

  /**
   * SentencePiece — Unigram 子词模型
   *
   * 使用 Unigram 语言模型进行子词分割，
   * 支持 subword regularization（动态 dropout）。
   *
   * 状态：计划 V5 实现（作为 BPE 的替代方案）
   */
  // SentencePiece = "sentencepiece",
}

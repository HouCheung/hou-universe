// ============================================================
// MiniMind — types.ts
// ============================================================
// Explain API 类型定义
//
// 这些类型为 MiniTokenizer.explain() 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

/**
 * 单个 token 的详细信息
 *
 * Playground 使用场景：
 *   - 逐 token 高亮渲染
 *   - 显示每个 token 是否存在于 vocabulary 中
 *   - 展示 token → id 的映射关系
 */
export interface TokenInfo {
  /** token 字符串 — 原始单词或 "<unk>"（未知词回退） */
  token: string;
  /** vocabulary 中对应的 id */
  id: number;
  /** 该 token 是否存在于 vocabulary 中（false 表示被回退为 <unk>） */
  exists: boolean;
}

/**
 * explain() 方法的完整返回结构
 *
 * 一次调用即可获得 tokenization 全貌：
 *   - 原始输入
 *   - 逐 token 详情
 *   - 未知词列表
 *   - 编码序列
 *   - 解码后的往返文本
 *
 * Playground 使用场景：
 *   - 渲染 tokenization 可视化面板
 *   - 对比原始文本 → tokens → ids → 解码文本的完整链路
 *   - 快速定位未知 token
 */
export interface ExplainResult {
  /** 原始输入文本 */
  originalText: string;
  /** 每个 token 的详细信息（与原始单词一一对应） */
  tokens: TokenInfo[];
  /** 未在 vocabulary 中出现的原始单词列表 */
  unknownTokens: string[];
  /** encode() 输出的 id 序列 */
  encoded: number[];
  /** decode() 输出的往返文本 */
  decoded: string;
}

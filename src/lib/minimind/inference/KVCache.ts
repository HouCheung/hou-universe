// ============================================================
// MiniMind — inference/KVCache.ts
// ============================================================
// KVCache — 教育型 KV Cache 管理器
//
// 核心功能：
//   - 按层存储 K 和 V 张量（分头格式）
//   - 增量追加 — 每个生成步骤添加新 token 的 K/V
//   - 完整的 PositionMetadata — 每个缓存位置可检查
//   - 支持清空和重置
//
// 数据结构：
//   每层存储：
//     k: [numHeads][cachedSeqLen][headDim]
//     v: [numHeads][cachedSeqLen][headDim]
//     metadata: [cachedSeqLen] — 每个位置的 token、熵信息
//
// 教育重点：
//   - KV Cache 为什么重要 — 避免重新计算过去的 K/V
//   - 增量增长 — 每次只追加新 token，不修改已有缓存
//   - 可检查 — 每个位置存储了完整的上下文信息
// ============================================================

import type { KVCacheEntry, PositionMetadata } from "./types";

/**
 * KVCache — 教育用 KV Cache 管理器
 *
 * 核心职责：
 *   存储所有层的 K 和 V 张量（分头格式），支持增量追加和清空。
 *   每个缓存位置附有 inspectable 的 PositionMetadata。
 *
 * 使用方式：
 *
 * ```ts
 * const cache = new KVCache({ numLayers: 4, numHeads: 8, headDim: 64 });
 *
 * // Prompt 处理后填充所有层的 K/V（每层 seqLen 个位置）
 * for (let layer = 0; layer < 4; layer++) {
 *   cache.append(layer, kHeads, vHeads, metadata);
 * }
 *
 * // 生成阶段追加新 token
 * cache.append(layerIdx, kNew, vNew, metadata);
 *
 * // 检查缓存状态
 * const seqLen = cache.getCachedSeqLen(); // → 当前缓存长度
 * const entry = cache.get(0);             // → 第 0 层的完整缓存
 * ```
 */
export class KVCache {
  private entries: Map<number, KVCacheEntry>;
  private numLayers: number;
  private numHeads: number;

  /**
   * @param config — { numLayers, numHeads, headDim }
   *
   * 构造时立即初始化空的 per-layer 缓存结构。
   * 所有层初始 K/V 为空数组，metadata 为空数组。
   */
  constructor(config: {
    numLayers: number;
    numHeads: number;
    headDim: number;
  }) {
    if (!Number.isInteger(config.numLayers) || config.numLayers <= 0) {
      throw new Error(
        `numLayers must be a positive integer, got ${config.numLayers}`
      );
    }
    if (!Number.isInteger(config.numHeads) || config.numHeads <= 0) {
      throw new Error(
        `numHeads must be a positive integer, got ${config.numHeads}`
      );
    }
    if (!Number.isInteger(config.headDim) || config.headDim <= 0) {
      throw new Error(
        `headDim must be a positive integer, got ${config.headDim}`
      );
    }

    this.numLayers = config.numLayers;
    this.numHeads = config.numHeads;
    this.entries = new Map();

    for (let i = 0; i < this.numLayers; i++) {
      this.entries.set(i, {
        layerIndex: i,
        k: [],
        v: [],
        metadata: [],
      });
    }
  }

  /**
   * get(layerIndex) — 获取指定层的缓存条目
   *
   * 返回该层的完整 KVCacheEntry 的深拷贝，包括 K/V 张量和 metadata。
   * 如果 layerIndex 超出范围，返回 null。
   *
   * @param layerIndex — 0-based 层索引
   * @returns           该层缓存条目的深拷贝，或 null
   */
  get(layerIndex: number): KVCacheEntry | null {
    const entry = this.entries.get(layerIndex);
    if (!entry) return null;
    return {
      layerIndex: entry.layerIndex,
      k: entry.k.map((head) => head.map((row) => [...row])),
      v: entry.v.map((head) => head.map((row) => [...row])),
      metadata: entry.metadata.map((m) => ({
        ...m,
        headEntropies: m.headEntropies ? [...m.headEntropies] : null,
      })),
    };
  }

  /**
   * append(layerIndex, k, v, metadata) — 向指定层追加新位置的 K/V
   *
   * 将新 token 的 K 和 V 张量追加到该层的缓存末尾。
   * k 和 v 的形状为 [numHeads][1][headDim] — 单个 token 的分头格式。
   * metadata 为单个 PositionMetadata 对象。
   *
   * 验证：
   *   - layerIndex 必须在 [0, numLayers) 范围内
   *   - k 和 v 的 numHeads 必须匹配构造参数
   *   - k 和 v 的每个头必须恰好有 1 行（单 token）
   *   - 每个头的向量长度必须非零且跨头一致
   *
   * @param layerIndex — 0-based 层索引
   * @param k          — 新 token 的 Key 张量 [numHeads][1][headDim]
   * @param v          — 新 token 的 Value 张量 [numHeads][1][headDim]
   * @param metadata   — 新 token 的位置元数据
   */
  append(
    layerIndex: number,
    k: number[][][],
    v: number[][][],
    metadata: PositionMetadata
  ): void {
    const entry = this.entries.get(layerIndex);
    if (!entry) {
      throw new Error(
        `Layer index ${layerIndex} out of range [0, ${this.numLayers})`
      );
    }
    if (k.length !== this.numHeads) {
      throw new Error(
        `K numHeads mismatch: expected ${this.numHeads}, got ${k.length}`
      );
    }
    if (v.length !== this.numHeads) {
      throw new Error(
        `V numHeads mismatch: expected ${this.numHeads}, got ${v.length}`
      );
    }

    // k[h] 是 [1][headDim] — 验证并提取存储为 [headDim]
    for (let h = 0; h < this.numHeads; h++) {
      if (!k[h] || k[h].length !== 1) {
        throw new Error(
          `k[${h}] must have exactly 1 token row, got ${k[h]?.length ?? 0}`
        );
      }
      if (!v[h] || v[h].length !== 1) {
        throw new Error(
          `v[${h}] must have exactly 1 token row, got ${v[h]?.length ?? 0}`
        );
      }
      if (k[h][0].length === 0) {
        throw new Error(`k[${h}][0] must be non-empty (headDim > 0)`);
      }
      if (v[h][0].length === 0) {
        throw new Error(`v[${h}][0] must be non-empty (headDim > 0)`);
      }
      if (h > 0) {
        if (k[h][0].length !== k[0][0].length) {
          throw new Error(
            `k[${h}][0] headDim mismatch: expected ${k[0][0].length}, got ${k[h][0].length}`
          );
        }
        if (v[h][0].length !== v[0][0].length) {
          throw new Error(
            `v[${h}][0] headDim mismatch: expected ${v[0][0].length}, got ${v[h][0].length}`
          );
        }
      }

      if (!entry.k[h]) {
        entry.k[h] = [];
      }
      if (!entry.v[h]) {
        entry.v[h] = [];
      }
      entry.k[h].push([...k[h][0]]);
      entry.v[h].push([...v[h][0]]);
    }

    entry.metadata.push({ ...metadata });
  }

  /**
   * getLayerCount() — 返回缓存的层数
   */
  getLayerCount(): number {
    return this.numLayers;
  }

  /**
   * getCachedSeqLen() — 返回当前缓存的序列长度
   *
   * 计算所有层 metadata 长度的最小值。
   * 所有层的缓存长度应该相同（每次 append 对所有层执行），
   * 取最小值可安全处理异常情况。
   */
  getCachedSeqLen(): number {
    let minLen = Infinity;
    for (const entry of this.entries.values()) {
      if (entry.metadata.length < minLen) {
        minLen = entry.metadata.length;
      }
    }
    return minLen === Infinity ? 0 : minLen;
  }

  /**
   * clear() — 清空所有层的缓存
   *
   * 重置为构造时的空状态。保留层结构，仅清空 K/V/metadata。
   */
  clear(): void {
    for (const entry of this.entries.values()) {
      entry.k = [];
      entry.v = [];
      entry.metadata = [];
    }
  }

  /**
   * getEntries() — 获取所有层的缓存条目（深拷贝）
   *
   * 返回按 layerIndex 升序排列的 KVCacheEntry 数组。
   * 所有 K/V 张量和 metadata 均为深拷贝，调用方无法修改内部缓存。
   * 用于序列化和可视化。
   */
  getEntries(): KVCacheEntry[] {
    const result: KVCacheEntry[] = [];
    for (let i = 0; i < this.numLayers; i++) {
      const entry = this.entries.get(i)!;
      result.push({
        layerIndex: entry.layerIndex,
        k: entry.k.map((head) => head.map((row) => [...row])),
        v: entry.v.map((head) => head.map((row) => [...row])),
        metadata: entry.metadata.map((m) => ({
          ...m,
          headEntropies: m.headEntropies ? [...m.headEntropies] : null,
        })),
      });
    }
    return result;
  }
}

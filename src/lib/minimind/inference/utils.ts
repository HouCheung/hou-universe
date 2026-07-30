// ============================================================
// MiniMind — inference/utils.ts
// ============================================================
// Inference 内部工具函数
//
// 提供分头/合并的数组 reshape 操作。
// 这些函数在 MiniAttention 中是私有的 — 此处重建等效实现，
// 仅 10 行纯数组操作，不引入任何外部依赖。
// ============================================================

/**
 * splitIntoHeads — 将 dModel 维向量拆分为多个 head
 *
 * 形状变换：[seqLen, dModel] → [numHeads, seqLen, headDim]
 *
 * 每个 token 的 dModel 维向量被等分为 numHeads 段，
 * 每段长度为 headDim = dModel / numHeads。
 *
 * 这是 MiniAttention.splitHeads() 的等效实现。
 * 重建原因：MiniAttention 中为 private 方法，无法外部访问。
 *
 * @param x        — 输入矩阵 [seqLen][dModel]
 * @param numHeads — 注意力头数量
 * @param headDim  — 每个头的维度
 * @returns          分头后的三维数组 [numHeads][seqLen][headDim]
 */
export function splitIntoHeads(
  x: number[][],
  numHeads: number,
  headDim: number
): number[][][] {
  const seqLen = x.length;

  const heads: number[][][] = new Array(numHeads);
  for (let h = 0; h < numHeads; h++) {
    heads[h] = new Array(seqLen);
    const offset = h * headDim;
    for (let pos = 0; pos < seqLen; pos++) {
      heads[h][pos] = new Array(headDim);
      for (let d = 0; d < headDim; d++) {
        heads[h][pos][d] = x[pos][offset + d];
      }
    }
  }

  return heads;
}

/**
 * mergeFromHeads — 将多个 head 的输出合并为 dModel 维向量
 *
 * 形状变换：[numHeads, seqLen, headDim] → [seqLen, dModel]
 *
 * splitIntoHeads 的逆操作。head 0 占据 dims [0..headDim-1]，
 * head 1 占据 dims [headDim..2*headDim-1]，依此类推。
 *
 * 这是 MiniAttention.mergeHeads() 的等效实现。
 * 重建原因：MiniAttention 中为 private 方法，无法外部访问。
 *
 * @param heads — 分头格式 [numHeads][seqLen][headDim]
 * @returns       合并后的矩阵 [seqLen][dModel]
 */
export function mergeFromHeads(heads: number[][][]): number[][] {
  const numHeads = heads.length;
  const seqLen = heads[0]?.length ?? 0;
  const headDim = heads[0]?.[0]?.length ?? 0;
  const dModel = numHeads * headDim;

  const merged: number[][] = new Array(seqLen);
  for (let pos = 0; pos < seqLen; pos++) {
    merged[pos] = new Array(dModel);
    for (let h = 0; h < numHeads; h++) {
      const offset = h * headDim;
      for (let d = 0; d < headDim; d++) {
        merged[pos][offset + d] = heads[h][pos][d];
      }
    }
  }

  return merged;
}

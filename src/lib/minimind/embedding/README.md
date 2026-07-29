# MiniEmbedding

> Educational Embedding Engine — Phase 10.2
>
> 对应文档：[docs/minimind/02-embedding.md](../../../docs/minimind/02-embedding.md)

## Purpose

将 Tokenizer 输出的离散 token ID 映射为连续稠密向量（dense vector）。

没有 Embedding 层，整数 token ID 对模型而言只是无意义的标签；
有了 Embedding，每个 token 在 `embeddingDim` 维空间中占据一个坐标，
语义相近的词坐标相近。

## API

### `new MiniEmbedding(config)`

构造 embedding 引擎并初始化矩阵。

```ts
import { MiniEmbedding } from "@/lib/minimind/embedding";

const emb = new MiniEmbedding({
  vocabSize: 6400,    // 词汇表大小（矩阵行数）
  embeddingDim: 512,  // 向量维度 = d_model
});
```

### `getEmbedding(tokenId: number): number[]`

获取单个 token 的 embedding 向量。

```ts
const vec = emb.getEmbedding(42);
// → [0.0012, -0.0045, 0.0078, ...]  (512 elements)
```

越界的 `tokenId` 返回零向量并 `console.warn`。

### `getEmbeddings(tokenIds: number[]): number[][]`

批量获取多个 token 的 embedding 向量。

```ts
const vecs = emb.getEmbeddings([128, 456, 789]);
// → [[...512 elements], [...512 elements], [...512 elements]]
```

### `getMatrixInfo(): MatrixInfo`

获取矩阵元信息。

```ts
const info = emb.getMatrixInfo();
// → {
//     vocabSize: 6400,
//     embeddingDim: 512,
//     totalParameters: 3276800    // 6400 × 512
//   }
```

### `getRawMatrix(): ReadonlyArray<Float64Array>`

获取完整 embedding 矩阵的只读引用，用于可视化（PCA / t-SNE）。

```ts
const matrix = emb.getRawMatrix();
matrix[0];  // token 0 的 512 维向量
```

## Data Flow

```
Token ID (integer)
  │
  ▼
W_embed[row]  ←  查表（O(1) 内存索引，不涉及矩阵乘法）
  │
  ▼
Dense Vector (number[])
  │
  ▼
Positional Encoding → Transformer Block
```

## Initialization

使用确定性 **Mulberry32 PRNG** 初始化：

- 种子 = `tokenId`（同一 token 始终生成相同向量）
- 值范围 = `U(-√(6/dim), +√(6/dim))`（Xavier uniform）
- 零外部依赖 — 纯 TypeScript 实现

## Matrix Structure

```
         embeddingDim (512)
         ─────────────────→
vocabSize   [ 0.0012, -0.0045,  0.0078, ...,  0.0033 ]  ← token 0
(6400)      [ 0.0067,  0.0021, -0.0009, ..., -0.0054 ]  ← token 1
  │         [ -0.0033, 0.0089,  0.0015, ...,  0.0072 ]  ← token 2
  ▼         ...
            [ 0.0005, -0.0067,  0.0044, ..., -0.0011 ]  ← token 6399
```

## Quick Example

```ts
import { MiniEmbedding } from "@/lib/minimind/embedding";

// 1. Create
const emb = new MiniEmbedding({ vocabSize: 10, embeddingDim: 4 });

// 2. Lookup
const v0 = emb.getEmbedding(0);
console.log(v0); // [0.1, -0.2, 0.05, -0.08]

// 3. Batch
const batch = emb.getEmbeddings([0, 1, 2]);
console.log(batch.length); // 3

// 4. Info
console.log(emb.getMatrixInfo());
// { vocabSize: 10, embeddingDim: 4, totalParameters: 40 }
```

## Related

- [Tokenizer](../tokenizer/) — 上游模块，输出 token ID 序列
- [docs/minimind/02-embedding.md](../../../docs/minimind/02-embedding.md) — 完整知识文档
- [src/data/minimind/embedding-registry.ts](../../../data/minimind/embedding-registry.ts) — 元数据注册表（版本定义、概念目录、实验清单）

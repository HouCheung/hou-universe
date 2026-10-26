// ============================================================
// TensorEmbedding — Differentiable embedding lookup layer
// ============================================================
// Extends Module. Maintains a trainable embedding matrix of shape
// [vocabSize, embeddingDim] and performs sparse lookup during forward.
//
// PyTorch equivalent: nn.Embedding(vocabSize, embeddingDim)
//
// Forward:
//   Given inputIds [batch, seq] of integer token IDs,
//   returns embeddings [batch, seq, embeddingDim] by looking up
//   each token's row in the embedding matrix.
//
// Backward:
//   Only rows that were accessed accumulate gradient (sparse update).
//   Repeated token accesses accumulate multiple contributions.
//
// Parameters (registered via Module):
//   - "weight": [vocabSize, embeddingDim]
//
// Usage:
//   const emb = new TensorEmbedding(6400, 512);
//   const ids = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]); // [2, 3]
//   const vecs = emb.forward(ids); // [2, 3, 512]
// ============================================================

import { Module } from "../core/Module";
import { Parameter } from "../core/Parameter";
import { Tensor, shapeSize } from "../core/Tensor";

export class TensorEmbedding extends Module {
  /** Vocabulary size (number of rows in embedding matrix) */
  readonly vocabSize: number;
  /** Embedding dimension (number of columns) */
  readonly embeddingDim: number;

  /** Embedding matrix: [vocabSize, embeddingDim] */
  private _weight: Parameter;

  /**
   * @param vocabSize    - Number of tokens in vocabulary
   * @param embeddingDim - Dimension of each embedding vector (d_model)
   */
  constructor(vocabSize: number, embeddingDim: number) {
    if (vocabSize <= 0) {
      throw new Error(`TensorEmbedding: vocabSize must be positive, got ${vocabSize}`);
    }
    if (embeddingDim <= 0) {
      throw new Error(`TensorEmbedding: embeddingDim must be positive, got ${embeddingDim}`);
    }

    super();

    this.vocabSize = vocabSize;
    this.embeddingDim = embeddingDim;

    // Xavier-ish initialization scaled for embeddings
    // N(0, 1/sqrt(embeddingDim)) — standard for embedding layers
    const scale = 1.0 / Math.sqrt(embeddingDim);
    const weightTensor = Tensor.randn([vocabSize, embeddingDim]);
    for (let i = 0; i < weightTensor.data.length; i++) {
      weightTensor.data[i] *= scale;
    }
    this._weight = new Parameter(weightTensor, "weight");
    this.registerParameter("weight", this._weight);
  }

  /**
   * Forward pass: embedding lookup.
   *
   * @param inputIds - Integer tensor of token IDs, shape [batch, seq]
   *                   Values must be in [0, vocabSize).
   * @returns Embedding vectors, shape [batch, seq, embeddingDim]
   */
  forward(inputIds: Tensor): Tensor {
    const shape = inputIds.shape;

    if (shape.length !== 2) {
      throw new Error(
        `TensorEmbedding.forward: input must be 2D [batch, seq]. ` +
          `Got shape [${shape}] (ndim=${shape.length}).`
      );
    }

    const batch = shape[0];
    const seq = shape[1];
    const dim = this.embeddingDim;
    const vocabSize = this.vocabSize;

    // ── Forward: lookup ──
    const totalPositions = batch * seq;
    const outSize = totalPositions * dim;
    const result = new Float64Array(outSize);

    // Stash token IDs as integers for backward
    const tokenIds = new Int32Array(totalPositions);

    for (let pos = 0; pos < totalPositions; pos++) {
      const tokenId = Math.round(inputIds.data[pos]);
      if (tokenId < 0 || tokenId >= vocabSize) {
        throw new Error(
          `TensorEmbedding.forward: tokenId ${tokenId} out of range [0, ${vocabSize}).`
        );
      }
      tokenIds[pos] = tokenId;

      // Copy the embedding row to output
      const srcOffset = tokenId * dim;
      const dstOffset = pos * dim;
      for (let d = 0; d < dim; d++) {
        result[dstOffset + d] = this._weight.data[srcOffset + d];
      }
    }

    const out = new Tensor(result, [batch, seq, dim], this._weight.requiresGrad);

    // ── Backward: sparse gradient accumulation ──
    if (out.requiresGrad) {
      out._ctx = {
        parents: [this._weight],
        backwardFn: (gradOutput: Float64Array) => {
          // gradOutput shape: [batch, seq, dim]
          // Accumulate gradients only to accessed rows
          const gradEmbed = new Float64Array(vocabSize * dim);
          for (let pos = 0; pos < totalPositions; pos++) {
            const tokenId = tokenIds[pos];
            const srcOffset = pos * dim;    // offset in gradOutput
            const dstOffset = tokenId * dim; // offset in gradEmbed
            for (let d = 0; d < dim; d++) {
              gradEmbed[dstOffset + d] += gradOutput[srcOffset + d];
            }
          }
          this._weight.accumulateGrad(gradEmbed);
        },
      };
    }

    return out;
  }

  /** Direct access to embedding weight parameter */
  get weight(): Parameter {
    return this._weight;
  }
}

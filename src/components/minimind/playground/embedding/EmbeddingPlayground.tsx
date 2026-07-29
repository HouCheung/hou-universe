"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { MiniEmbedding } from "@/lib/minimind/embedding";
import type { EmbeddingVector, MatrixInfo } from "@/lib/minimind/embedding";
import { EmbeddingInput } from "./EmbeddingInput";
import { EmbeddingVectorView } from "./EmbeddingVectorView";
import { EmbeddingMatrixView } from "./EmbeddingMatrixView";
import { EmbeddingInfoCard } from "./EmbeddingInfoCard";

// ============================================================
// EmbeddingPlayground — Interactive Embedding Explorer
// ============================================================
//
// Parent orchestrator for the Embedding playground.
//
// Responsibilities:
//   1. Create & own a MiniEmbedding instance (deterministic, shared)
//   2. Manage selected tokenId state
//   3. Derive vector + matrix data from the MiniEmbedding instance
//   4. Pass data down to focused sub-components
//
// Data flow:
//   User types tokenId → EmbeddingInput → onChange(tokenId)
//     → getEmbedding(tokenId) → EmbeddingVectorView
//     → getRawMatrix()          → EmbeddingMatrixView
//     → getMatrixInfo()         → EmbeddingInfoCard
// ============================================================

// ── Default config — matches embedding-registry.ts V1 ─────────

const DEFAULT_VOCAB_SIZE = 6400;
const DEFAULT_EMBEDDING_DIM = 512;
const DEFAULT_TOKEN_ID = 42;

// ── Component ────────────────────────────────────────────────

export function EmbeddingPlayground() {
  // Create MiniEmbedding once — deterministic PRNG ensures
  // the same matrix every time for the same config.
  const embedding = useRef<MiniEmbedding>(
    new MiniEmbedding({
      vocabSize: DEFAULT_VOCAB_SIZE,
      embeddingDim: DEFAULT_EMBEDDING_DIM,
    })
  ).current;

  // Matrix info is static for a given config — compute once
  const matrixInfo: MatrixInfo = useMemo(
    () => embedding.getMatrixInfo(),
    [embedding]
  );

  // Raw matrix reference — static, no need to recompute
  const rawMatrix: ReadonlyArray<Float64Array> = useMemo(
    () => embedding.getRawMatrix(),
    [embedding]
  );

  const [tokenId, setTokenId] = useState(DEFAULT_TOKEN_ID);

  // Derive current vector from tokenId
  const currentVector: EmbeddingVector = useMemo(
    () => embedding.getEmbedding(tokenId),
    [embedding, tokenId]
  );

  const handleTokenIdChange = useCallback((newId: number) => {
    setTokenId(newId);
  }, []);

  const handleSelectToken = useCallback((newId: number) => {
    setTokenId(newId);
  }, []);

  return (
    <div className="space-y-5">
      {/* ① Module Info Card */}
      <EmbeddingInfoCard info={matrixInfo} />

      {/* ② Token ID Input */}
      <EmbeddingInput
        value={tokenId}
        maxTokenId={matrixInfo.vocabSize - 1}
        onChange={handleTokenIdChange}
      />

      {/* ③ Vector Visualization */}
      <EmbeddingVectorView vector={currentVector} tokenId={tokenId} />

      {/* ④ Matrix Viewer */}
      <EmbeddingMatrixView
        matrix={rawMatrix}
        selectedTokenId={tokenId}
        onSelectToken={handleSelectToken}
      />
    </div>
  );
}

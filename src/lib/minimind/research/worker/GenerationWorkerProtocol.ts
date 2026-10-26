// ============================================================
// MiniMind — research/worker/GenerationWorkerProtocol.ts
// ============================================================
// Phase 67: Web Worker generation protocol.
//
// Defines the message types exchanged between GenerationRuntime
// (main thread) and GenerationWorker (Web Worker).
//
// Design:
//   - Strict typed commands from main → worker
//   - Strict typed events from worker → main
//   - Browser-safe — no Node.js imports
//   - Follows TrainingWorkerProtocol pattern
// ============================================================

import type { GenerationResult } from "../GenerationResult";

// ============================================================
// Commands (Main → Worker)
// ============================================================

export interface GenerationWorkerStartCommand {
  type: "start";
  requestId: string;
  sessionId: string;
  checkpointId?: string;
  /** Serialized checkpoint data (for trained model generation) */
  checkpointJSON?: string;
  /** Model configuration for reconstruction */
  modelConfig: {
    vocabSize: number;
    dModel: number;
    numHeads: number;
    dFF: number;
    numLayers: number;
    maxSeqLen: number;
  };
  /** Generation parameters */
  generationParams: {
    prompt: string;
    maxTokens: number;
    temperature: number;
    topK: number;
    topP: number;
    seed?: number;
    eosTokenId?: number;
  };
  /** Tokenizer training corpus */
  corpus: string[];
  /** Whether this is a baseline (no checkpoint) generation */
  isBaseline: boolean;
}

export interface GenerationWorkerCancelCommand {
  type: "cancel";
  requestId: string;
}

export type GenerationWorkerCommand =
  | GenerationWorkerStartCommand
  | GenerationWorkerCancelCommand;

// ============================================================
// Events (Worker → Main)
// ============================================================

export interface GenerationWorkerStartedEvent {
  type: "started";
  requestId: string;
}

export interface GenerationWorkerProgressEvent {
  type: "progress";
  requestId: string;
  /** Tokens generated so far */
  tokensGenerated: number;
  /** Max tokens to generate */
  maxTokens: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

export interface GenerationWorkerCompletedEvent {
  type: "completed";
  requestId: string;
  /** The generation result */
  result: GenerationResult;
}

export interface GenerationWorkerErrorEvent {
  type: "error";
  requestId: string;
  error: string;
}

export interface GenerationWorkerTokenEvent {
  type: "token";
  requestId: string;
  /** Decoded token string */
  token: string;
  /** Zero-based token index */
  tokenIndex: number;
  /** Accumulated text so far (all tokens decoded together) */
  textSoFar: string;
}

export interface GenerationWorkerCancelledEvent {
  type: "cancelled";
  requestId: string;
}

export interface GenerationWorkerStoppedEvent {
  type: "stopped";
  requestId: string;
  /** Partial result with whatever was generated before stop */
  result: import("../GenerationResult").GenerationResult;
}

export type GenerationWorkerEvent =
  | GenerationWorkerStartedEvent
  | GenerationWorkerProgressEvent
  | GenerationWorkerTokenEvent
  | GenerationWorkerCompletedEvent
  | GenerationWorkerErrorEvent
  | GenerationWorkerCancelledEvent
  | GenerationWorkerStoppedEvent;

// ============================================================
// Worker message envelope
// ============================================================

/** Message from main thread to worker */
export type GenerationWorkerInMessage = GenerationWorkerCommand;

/** Message from worker to main thread */
export type GenerationWorkerOutMessage = GenerationWorkerEvent;

// ============================================================
// ModelStats — Parameter counting and model architecture summary
// ============================================================
// Phase 50: Provides torchinfo.summary()-like functionality for
// MiniMind models. Computes parameter counts per layer, memory
// estimates, and architecture overviews.
//
// Key features:
//   - Exact parameter count from model.namedParameters()
//   - Per-layer breakdown (embedding, each transformer block, etc.)
//   - Memory estimation (FP32, FP16, INT8)
//   - Total FLOPs estimation for a forward pass
//   - Human-readable summary tables
//
// Usage:
//   const stats = ModelStats.summarize(model);
//   console.log(stats.formattedSummary);
//   // Or programmatic:
//   console.log(stats.totalParameters);
//   console.log(stats.layerBreakdown);
// ============================================================

import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { Module } from "../core/Module";
import type { Parameter } from "../core/Parameter";

// ============================================================
// Types
// ============================================================

/**
 * Per-layer parameter breakdown.
 */
export interface LayerStats {
  /** Layer name (e.g. "embedding", "blocks.0.attention") */
  name: string;
  /** Number of parameter objects in this layer */
  parameterCount: number;
  /** Total scalar elements in this layer */
  totalElements: number;
  /** Percentage of total model parameters */
  percentage: number;
  /** Sub-parameters within this layer */
  parameters: ParameterDetail[];
}

/**
 * Detail for a single parameter tensor.
 */
export interface ParameterDetail {
  /** Parameter name */
  name: string;
  /** Parameter shape */
  shape: number[];
  /** Number of elements */
  elements: number;
  /** Whether this parameter is trainable */
  trainable: boolean;
}

/**
 * Memory estimates for different precision formats.
 */
export interface MemoryEstimate {
  /** Bytes for FP32 (Float64 in our case — 8 bytes/element) */
  float64Bytes: number;
  /** Bytes for FP32 (4 bytes/element) */
  float32Bytes: number;
  /** Bytes for FP16 (2 bytes/element) */
  float16Bytes: number;
  /** Human-readable sizes */
  formatted: {
    float64: string;
    float32: string;
    float16: string;
  };
}

/**
 * Complete model statistics report.
 */
export interface ModelStatsReport {
  /** Model class name */
  modelType: string;
  /** Architecture summary */
  architecture: ArchitectureSummary;
  /** Total parameter count (scalar elements) */
  totalParameters: number;
  /** Total parameter objects */
  totalParameterObjects: number;
  /** Per-layer breakdown */
  layerBreakdown: LayerStats[];
  /** Memory estimates */
  memory: MemoryEstimate;
  /** Estimated FLOPs for one forward pass */
  estimatedFlops: number;
  /** Human-readable formatted summary string */
  formattedSummary: string;
}

/**
 * Architecture summary (key dimensions).
 */
export interface ArchitectureSummary {
  vocabSize: number;
  dModel: number;
  numHeads: number;
  dFF: number;
  numLayers: number;
  maxSeqLen: number;
  headDim: number;
}

// ============================================================
// ModelStats
// ============================================================

export class ModelStats {
  /**
   * Generate a complete statistics report for a model.
   *
   * This is the primary API — one call produces everything.
   *
   * @param model - TensorMiniMindModel instance
   * @returns Complete ModelStatsReport
   *
   * Example:
   *   const report = ModelStats.summarize(model);
   *   console.log(report.totalParameters);      // 600000
   *   console.log(report.formattedSummary);     // Pretty table
   */
  static summarize(model: TensorMiniMindModel): ModelStatsReport {
    const namedParams = model.namedParameters();

    // Architecture summary
    const architecture: ArchitectureSummary = {
      vocabSize: model.vocabSize,
      dModel: model.dModel,
      numHeads: model.numHeads,
      dFF: model.dFF,
      numLayers: model.numLayers,
      maxSeqLen: model.maxSeqLen,
      headDim: model.dModel / model.numHeads,
    };

    // Total counts
    const totalParameterObjects = namedParams.length;
    const totalParameters = namedParams.reduce(
      (sum, { parameter }) => sum + parameter.size,
      0
    );

    // Per-layer breakdown
    const layerBreakdown = ModelStats.buildLayerBreakdown(namedParams, totalParameters);

    // Memory estimates
    const memory = ModelStats.estimateMemory(totalParameters);

    // FLOPs estimation
    const estimatedFlops = ModelStats.estimateFlops(architecture);

    // Formatted summary
    const formattedSummary = ModelStats.formatSummary(
      architecture,
      totalParameters,
      totalParameterObjects,
      layerBreakdown,
      memory,
      estimatedFlops
    );

    return {
      modelType: "TensorMiniMindModel",
      architecture,
      totalParameters,
      totalParameterObjects,
      layerBreakdown,
      memory,
      estimatedFlops,
      formattedSummary,
    };
  }

  /**
   * Get just the total parameter count for a model.
   *
   * @param model - Model to count parameters for
   * @returns Total scalar parameter count
   */
  static parameterCount(model: TensorMiniMindModel): number {
    let count = 0;
    for (const p of model.parameters()) {
      count += p.size;
    }
    return count;
  }

  /**
   * Get just the total parameter count from a Module.
   *
   * @param module - Module to count parameters for
   * @returns Total scalar parameter count
   */
  static moduleParameterCount(module: Module): number {
    let count = 0;
    for (const p of module.parameters()) {
      count += p.size;
    }
    return count;
  }

  /**
   * Count parameters by layer group.
   *
   * Groups layers into: embedding, transformer blocks (per block),
   * final norm, and lm head.
   *
   * @param model - Model to analyze
   * @returns Record mapping group name to parameter count
   */
  static parameterCountByGroup(
    model: TensorMiniMindModel
  ): Record<string, number> {
    const groups: Record<string, number> = {};

    for (const { name, parameter } of model.namedParameters()) {
      // Determine group from parameter name
      let group: string;
      if (name.startsWith("embedding")) {
        group = "embedding";
      } else if (name.startsWith("blocks.")) {
        // Extract block index: "blocks.0.attention.q_proj.weight" → "blocks.0"
        const parts = name.split(".");
        group = `blocks.${parts[1]}`;
      } else if (name.startsWith("finalNorm")) {
        group = "finalNorm";
      } else if (name.startsWith("lmHead")) {
        group = "lmHead";
      } else {
        group = "other";
      }

      groups[group] = (groups[group] || 0) + parameter.size;
    }

    return groups;
  }

  /**
   * Count trainable vs non-trainable parameters.
   *
   * @param model - Model to analyze
   * @returns { trainable, nonTrainable }
   */
  static trainableCount(
    model: TensorMiniMindModel
  ): { trainable: number; nonTrainable: number } {
    let trainable = 0;
    let nonTrainable = 0;

    for (const p of model.parameters()) {
      if (p.requiresGrad) {
        trainable += p.size;
      } else {
        nonTrainable += p.size;
      }
    }

    return { trainable, nonTrainable };
  }

  /**
   * Get a flat list of all parameter details.
   *
   * @param model - Model to inspect
   * @returns Array of parameter details
   */
  static parameterDetails(model: TensorMiniMindModel): ParameterDetail[] {
    const details: ParameterDetail[] = [];

    for (const { name, parameter } of model.namedParameters()) {
      details.push({
        name,
        shape: [...parameter.shape],
        elements: parameter.size,
        trainable: parameter.requiresGrad,
      });
    }

    return details;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Build per-layer breakdown from named parameters.
   */
  private static buildLayerBreakdown(
    namedParams: Array<{ name: string; parameter: Parameter }>,
    totalParameters: number
  ): LayerStats[] {
    // Group by layer prefix
    const groups = new Map<string, ParameterDetail[]>();

    for (const { name, parameter } of namedParams) {
      // Extract layer prefix: everything before the last dot
      // "blocks.0.attention.q_proj.weight" → "blocks.0.attention"
      const lastDot = name.lastIndexOf(".");
      const layerName = lastDot > 0 ? name.substring(0, lastDot) : name;

      if (!groups.has(layerName)) {
        groups.set(layerName, []);
      }

      groups.get(layerName)!.push({
        name,
        shape: [...parameter.shape],
        elements: parameter.size,
        trainable: parameter.requiresGrad,
      });
    }

    // Convert to LayerStats array
    const result: LayerStats[] = [];
    for (const [layerName, params] of groups) {
      const totalElements = params.reduce((sum, p) => sum + p.elements, 0);
      result.push({
        name: layerName,
        parameterCount: params.length,
        totalElements,
        percentage:
          totalParameters > 0
            ? Math.round((totalElements / totalParameters) * 10000) / 100
            : 0,
        parameters: params,
      });
    }

    return result;
  }

  /**
   * Estimate memory usage for different precision formats.
   */
  private static estimateMemory(totalParams: number): MemoryEstimate {
    const float64Bytes = totalParams * 8;
    const float32Bytes = totalParams * 4;
    const float16Bytes = totalParams * 2;

    return {
      float64Bytes,
      float32Bytes,
      float16Bytes,
      formatted: {
        float64: ModelStats.formatBytes(float64Bytes),
        float32: ModelStats.formatBytes(float32Bytes),
        float16: ModelStats.formatBytes(float16Bytes),
      },
    };
  }

  /**
   * Estimate FLOPs for a forward pass.
   *
   * Rough estimation for GPT-2 architecture:
   *   - Embedding: V * D (lookup, negligible)
   *   - Per layer:
   *     - Attention QKV: 3 * (2 * S * D * D) = 6 * S * D²
   *     - Attention scores: 2 * S² * D
   *     - Attention output: 2 * S * D * D
   *     - FFN gate+up: 2 * (2 * S * D * dFF) = 4 * S * D * dFF
   *     - FFN down: 2 * S * dFF * D
   *   - LM Head: 2 * S * D * V
   *
   * Simplified formula (per token):
   *   FLOPs ≈ 2 * params + 2 * numLayers * S * D
   */
  private static estimateFlops(arch: ArchitectureSummary): number {
    const { dModel, numHeads, dFF, numLayers, vocabSize } = arch;
    // Assumes seqLen=1 for per-token estimate
    const S = 1;

    // Per-layer FLOPs
    const attentionQKV = 6 * S * dModel * dModel;
    const attentionScores = 2 * S * S * dModel;
    const attentionOutput = 2 * S * dModel * dModel;
    const ffnGateUp = 4 * S * dModel * dFF;
    const ffnDown = 2 * S * dFF * dModel;

    const perLayer = attentionQKV + attentionScores + attentionOutput + ffnGateUp + ffnDown;
    const totalPerLayer = numLayers * perLayer;

    // LM Head
    const lmHead = 2 * S * dModel * vocabSize;

    return totalPerLayer + lmHead;
  }

  /**
   * Format bytes to human-readable string.
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(2)} ${units[i]}`;
  }

  /**
   * Format number with commas for thousands.
   */
  private static formatNumber(n: number): string {
    return n.toLocaleString();
  }

  /**
   * Generate human-readable summary string.
   */
  private static formatSummary(
    arch: ArchitectureSummary,
    totalParams: number,
    totalParamObjs: number,
    layerBreakdown: LayerStats[],
    memory: MemoryEstimate,
    flops: number
  ): string {
    const lines: string[] = [];

    lines.push("=".repeat(64));
    lines.push("Model Statistics — TensorMiniMindModel");
    lines.push("=".repeat(64));
    lines.push("");

    // Architecture
    lines.push("Architecture:");
    lines.push(`  Vocabulary Size:    ${ModelStats.formatNumber(arch.vocabSize)}`);
    lines.push(`  Model Dimension:    ${arch.dModel}`);
    lines.push(`  Attention Heads:    ${arch.numHeads} (head_dim=${arch.headDim})`);
    lines.push(`  FFN Dimension:      ${ModelStats.formatNumber(arch.dFF)}`);
    lines.push(`  Layers:             ${arch.numLayers}`);
    lines.push(`  Max Sequence Len:   ${arch.maxSeqLen}`);
    lines.push("");

    // Parameter summary
    lines.push("Parameters:");
    lines.push(`  Total Parameters:   ${ModelStats.formatNumber(totalParams)}`);
    lines.push(`  Parameter Objects:  ${totalParamObjs}`);
    lines.push("");

    // Layer breakdown
    lines.push("Layer Breakdown:");
    lines.push(
      `  ${"Layer".padEnd(40)} ${"Params".padStart(12)} ${"%".padStart(8)}`
    );
    lines.push(`  ${"-".repeat(60)}`);
    for (const layer of layerBreakdown) {
      const name = layer.name.padEnd(40);
      const params = ModelStats.formatNumber(layer.totalElements).padStart(12);
      const pct = `${layer.percentage.toFixed(1)}%`.padStart(8);
      lines.push(`  ${name}${params}${pct}`);
    }
    lines.push("");

    // Memory
    lines.push("Memory (parameters only):");
    lines.push(`  Float64 (current):  ${memory.formatted.float64}`);
    lines.push(`  Float32:             ${memory.formatted.float32}`);
    lines.push(`  Float16:             ${memory.formatted.float16}`);
    lines.push("");

    // FLOPs
    const flopsStr =
      flops >= 1e9
        ? `${(flops / 1e9).toFixed(2)} GFLOPs`
        : flops >= 1e6
          ? `${(flops / 1e6).toFixed(2)} MFLOPs`
          : `${ModelStats.formatNumber(flops)} FLOPs`;
    lines.push(`Estimated FLOPs (forward, per token): ${flopsStr}`);
    lines.push("");

    // Notes
    lines.push("─".repeat(64));
    lines.push("Notes:");
    lines.push("  • FLOPs are approximate (multiply-add = 2 ops)");
    lines.push("  • Memory excludes gradients and optimizer states");
    lines.push("  • AdamW adds ~2× parameter memory for m and v buffers");
    lines.push("=".repeat(64));

    return lines.join("\n");
  }
}

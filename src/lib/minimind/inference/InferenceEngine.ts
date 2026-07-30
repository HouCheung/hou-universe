// ============================================================
// MiniMind — inference/InferenceEngine.ts
// ============================================================
// InferenceEngine — 推理组合根
//
// 核心功能：
//   将 MiniMindModel、KVCache、Sampler、GenerationLoop
//   组合成完整的自回归文本生成引擎。
//
// 设计原则：
//   - 依赖注入 — MiniMindModel 由外部提供
//   - 组合根 — 不实现业务逻辑，只负责组装和委托
//   - 零模型修改 — 所有交互通过 MiniMindModel 的公开 API
//   - 纯库代码 — 无 React / 浏览器依赖
//
// 使用方式：
//
// ```ts
// const engine = new InferenceEngine(model);
// for await (const step of engine.generate("Hello", {
//   maxTokens: 20,
//   sampling: { temperature: 0.8, topK: 40, topP: 0.95 },
//   stopConditions: [{ type: "maxTokens" }],
//   debug: false,
// })) {
//   console.log(step.token);
// }
// const result = engine.getResult("Hello");
// ```
// ============================================================

import type { MiniMindModel } from "../model/MiniMindModel";
import type {
  InferenceConfig,
  GenerationStep,
  GenerationTrace,
  GenerationResult,
  KVCacheEntry,
} from "./types";
import { KVCache } from "./KVCache";
import { Sampler } from "./Sampler";
import { GenerationLoop } from "./GenerationLoop";
import { GreedySampler } from "./strategies/GreedySampler";
import { TemperatureSampler } from "./strategies/TemperatureSampler";
import { TopKSampler } from "./strategies/TopKSampler";
import { TopPSampler } from "./strategies/TopPSampler";

/**
 * InferenceEngine — MiniMind 推理引擎组合根
 *
 * 核心职责：
 *   作为组合根（composition root），创建并注入所有推理子模块。
 *   暴露 generate() 异步生成器作为唯一的公开生成 API。
 *
 * 子模块创建顺序：
 *   1. KVCache — 基于模型配置确定层数/头数/头维度
 *   2. Sampler — 注入 4 个策略实例
 *   3. GenerationLoop — 注入模型、KVCache、Sampler
 */
export class InferenceEngine {
  private model: MiniMindModel;
  private kvCache: KVCache;
  private sampler: Sampler;
  private loop: GenerationLoop;
  private lastTrace: GenerationTrace | null = null;

  /**
   * @param model — MiniMindModel 实例（依赖注入）
   *
   * 构造时立即：
   *   1. 读取模型配置（numLayers, numHeads, headDim）
   *   2. 创建 KVCache（匹配模型维度）
   *   3. 创建 Sampler（注入 4 个策略）
   *   4. 创建 GenerationLoop（注入模型、KVCache、Sampler）
   */
  constructor(model: MiniMindModel) {
    this.model = model;
    const config = model.getConfig();

    this.kvCache = new KVCache({
      numLayers: config.numLayers,
      numHeads: config.numHeads,
      headDim: config.headDim,
    });

    this.sampler = new Sampler([
      new TemperatureSampler(),
      new TopKSampler(),
      new TopPSampler(),
      new GreedySampler(),
    ]);

    this.loop = new GenerationLoop(model, this.kvCache, this.sampler);
  }

  /**
   * generate(prompt, config) — 自回归文本生成
   *
   * 异步生成器，每次迭代 yield 一个 GenerationStep。
   * 消费者可通过 break 提前终止。
   *
   * 接受默认配置的简便方式：
   *
   * ```ts
   * engine.generate("Hello") // 使用默认配置
   * engine.generate("Hello", { maxTokens: 50, sampling: { temperature: 0.7, topK: 0, topP: 1.0 }, stopConditions: [], debug: false })
   * ```
   *
   * @param prompt — 输入提示文本
   * @param config — 可选的生成配置（省略时使用合理默认值）
   * @yields       每个生成 token 的步骤记录
   */
  async *generate(
    prompt: string,
    config?: Partial<InferenceConfig>
  ): AsyncGenerator<GenerationStep> {
    const resolvedConfig = this.resolveConfig(config);

    // 收集步骤用于构建 trace
    const startTime = performance.now();
    const steps: GenerationStep[] = [];

    for await (const step of this.loop.generate(prompt, resolvedConfig)) {
      steps.push(step);
      yield step;
    }

    const durationMs = performance.now() - startTime;

    // 构建并存储 trace
    this.lastTrace = this.loop.buildTrace(prompt, steps, durationMs);
  }

  /**
   * getResult(prompt) — 从最近一次生成构建完整结果
   *
   * 在 generate() 完成后调用。
   *
   * @param prompt — 原始提示文本
   * @returns        包含文本、trace 和统计信息的完整结果
   */
  getResult(prompt: string): GenerationResult | null {
    const trace = this.lastTrace;
    if (!trace) return null;

    const generatedText = trace.steps.map((s) => s.token).join("");

    return {
      text: prompt + generatedText,
      tokensGenerated: trace.steps.length,
      stopReason: this.loop.getStopReason(),
      trace,
    };
  }

  // ============================================================
  // 公开 API — 访问器
  // ============================================================

  /**
   * getModel() — 获取注入的 MiniMindModel 实例
   */
  getModel(): MiniMindModel {
    return this.model;
  }

  /**
   * getCache() — 获取 KV Cache 条目（用于检查和可视化）
   *
   * 返回所有层的当前缓存状态。
   * 在 generate() 完成后调用以检查最终缓存。
   */
  getCache(): KVCacheEntry[] {
    return this.kvCache.getEntries();
  }

  /**
   * getTrace() — 获取最近一次生成的完整 trace
   *
   * 如果在 generate() 之前调用，返回 null。
   */
  getTrace(): GenerationTrace | null {
    return this.lastTrace;
  }

  // ============================================================
  // 内部
  // ============================================================

  /**
   * resolveConfig — 合并用户配置与默认值
   */
  private resolveConfig(
    partial?: Partial<InferenceConfig>
  ): InferenceConfig {
    return {
      maxTokens: partial?.maxTokens ?? 20,
      sampling: {
        temperature: partial?.sampling?.temperature ?? 1.0,
        topK: partial?.sampling?.topK ?? 0,
        topP: partial?.sampling?.topP ?? 1.0,
      },
      stopConditions: partial?.stopConditions ?? [{ type: "maxTokens" }],
      debug: partial?.debug ?? false,
      seed: partial?.seed,
    };
  }
}

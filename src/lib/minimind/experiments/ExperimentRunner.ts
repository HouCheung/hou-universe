// ============================================================
// MiniMind — experiments/ExperimentRunner.ts
// ============================================================
// ExperimentRunner 注册表 + 分发函数
//
// 核心功能：
//   - Runner 注册表 — 将实验 ID 映射到 runner 实例
//   - registerRunner() — 注册一个新的 runner
//   - getRunner() — 按实验 ID 查找 runner
//   - runExperiment() — 统一的实验执行入口
//
// 设计原则：
//   - 注册表模式 — 与 experiment-registry 的 SSOT 互补：
//     registry 定义"有哪些实验"，runner registry 定义"如何运行它们"
//   - 懒注册 — runner 在模块加载时自行注册
//   - 类型安全 — 泛型分发保持输入/输出类型
//   - 优雅降级 — runner 不存在或 context 缺失时返回 "failed" 结果
// ============================================================

import type {
  ExperimentResult,
  ExperimentContext,
  ExperimentRunner as IExperimentRunner,
} from "./types";

// ============================================================
// Runner 注册表
// ============================================================

/**
 * 全局 runner 注册表
 *
 * 键为 MiniMindExperiment.id，值为对应的 runner 实例。
 * Runner 在其模块文件中通过 registerRunner() 自行注册。
 *
 * 使用 Map 而非普通对象 — 保证插入顺序并支持动态增删。
 */
const runnerRegistry = new Map<string, IExperimentRunner>();

/**
 * registerRunner(runner) — 注册一个实验运行器
 *
 * 将 runner 按 experimentId 存入全局注册表。
 * 重复注册同一 experimentId 会覆盖旧的（最后写入胜出）。
 *
 * 通常在 runner 模块文件的底部调用：
 *
 * ```ts
 * // runners/TokenizerComparisonRunner.ts
 * registerRunner(new TokenizerComparisonRunner());
 * ```
 *
 * @param runner — 实现 ExperimentRunner 接口的实例
 */
export function registerRunner(runner: IExperimentRunner): void {
  runnerRegistry.set(runner.experimentId, runner);
}

/**
 * getRunner(experimentId) — 按实验 ID 获取 runner
 *
 * @param experimentId — MiniMindExperiment.id
 * @returns             对应的 runner 实例，未注册时返回 undefined
 */
export function getRunner(
  experimentId: string
): IExperimentRunner | undefined {
  return runnerRegistry.get(experimentId);
}

/**
 * getRegisteredExperimentIds() — 获取所有已注册的实验 ID
 *
 * 用于发现系统中有哪些实验可以运行。
 * 与 experiment-registry 的 getActiveExperiments() 互补：
 *   - registry 返回"理论上应该可用"的实验
 *   - 此函数返回"实际上已注册 runner"的实验
 *
 * @returns 已注册的实验 ID 数组
 */
export function getRegisteredExperimentIds(): string[] {
  return [...runnerRegistry.keys()];
}

// ============================================================
// 统一执行入口
// ============================================================

/**
 * runExperiment(experimentId, context, input)
 * — 执行单个实验的通用入口
 *
 * 工作流程：
 *   1. 查找 runner — 从注册表中按 experimentId 查找
 *   2. 校验 runner — 不存在则返回 "failed" 结果
 *   3. 校验 context — experimentId 必须匹配
 *   4. 委托 runner.run() — 执行实验逻辑
 *
 * 错误处理：
 *   - runner 未注册 → status: "failed"，errors 中包含提示
 *   - context 不匹配 → status: "failed"，errors 中包含提示
 *   - runner.run() 抛出未捕获异常 → status: "failed"
 *
 * 设计原则：
 *   - 统一入口 — 所有实验通过此函数执行
 *   - 防御式编程 — 每步独立校验
 *   - 计时封装 — timing 在此层记录，runner 无需关心
 *
 * @param experimentId — 实验 ID
 * @param context      — 实验上下文（由 createExperimentContext 创建）
 * @param input        — 实验输入（各实验自行定义）
 * @returns             统一的实验结果
 *
 * 示例：
 *   const result = runExperiment(
 *     "tokenizer-comparison-lab",
 *     context,
 *     { text: "Hello World" }
 *   );
 *   if (result.status === "success") {
 *     const data = result.data as TokenizerComparisonData;
 *   }
 */
export function runExperiment<TInput = unknown, TData = unknown>(
  experimentId: string,
  context: ExperimentContext,
  input: TInput
): ExperimentResult<TData> {
  const startMs = performance.now();

  // ── 查找 runner ──
  const runner = runnerRegistry.get(experimentId);
  if (!runner) {
    const endMs = performance.now();
    return {
      experimentId,
      status: "failed",
      data: null,
      errors: [
        {
          phase: "dispatch",
          message: `No runner registered for experiment "${experimentId}". ` +
            `Available runners: [${[...runnerRegistry.keys()].join(", ")}]`,
        },
      ],
      timing: {
        startMs,
        endMs,
        durationMs: endMs - startMs,
      },
    };
  }

  // ── 校验 context experimentId ──
  if (context.experimentId !== experimentId) {
    const endMs = performance.now();
    return {
      experimentId,
      status: "failed",
      data: null,
      errors: [
        {
          phase: "dispatch",
          message: `Context experimentId "${context.experimentId}" does not match requested "${experimentId}".`,
        },
      ],
      timing: {
        startMs,
        endMs,
        durationMs: endMs - startMs,
      },
    };
  }

  // ── 委托 runner ──
  try {
    const result = runner.run(context, input) as ExperimentResult<TData>;
    return result;
  } catch (err) {
    const endMs = performance.now();
    return {
      experimentId,
      status: "failed",
      data: null,
      errors: [
        {
          phase: "dispatch",
          message: `Runner for "${experimentId}" threw an unhandled exception.`,
          cause: err instanceof Error ? err.message : String(err),
        },
      ],
      timing: {
        startMs,
        endMs,
        durationMs: endMs - startMs,
      },
    };
  }
}

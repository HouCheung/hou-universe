// ============================================================
// MiniMind — experiments/ExperimentContext.ts
// ============================================================
// ExperimentContext 工厂 + CharacterTokenizer
//
// 核心功能：
//   - createExperimentContext() 根据实验的 dataRequirements
//     创建包含所需模块实例的 ExperimentContext
//   - CharacterTokenizer 是一个轻量级的字符级分词器，
//     与 MiniTokenizer 保持 API 兼容（子集），
//     用于 TokenizerComparison 实验
//
// 设计原则：
//   - 零核心模块修改 — CharacterTokenizer 在此定义，
//     不放入 src/lib/minimind/tokenizer/
//   - 依赖注入 — 所有模块配置可覆盖
//   - Registry 驱动 — 从 experiment-registry 读取需求
//   - 与 ForwardVisualAdapter 对齐 — 工厂模式 + 优雅降级
// ============================================================

import type { MiniMindExperiment, ExperimentDataRequirement } from "@/data/minimind/experiment-registry";
import { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import { MiniEmbedding } from "../embedding/Embedding";
import { MiniAttention } from "../attention/Attention";
import type {
  ExperimentContext,
  ExperimentModuleConfig,
  ICharacterTokenizer,
} from "./types";

// ============================================================
// 默认配置
// ============================================================

/**
 * 实验模块默认配置
 *
 * 与 MiniMindModel 默认配置对齐（vocabSize=1000, dModel=512,
 * numHeads=8, headDim=64, maxSeqLen=128）。
 * 调用方可传入 configOverrides 覆盖。
 */
const DEFAULT_MODULE_CONFIG: Required<ExperimentModuleConfig> = {
  embedding: {
    vocabSize: 1000,
    embeddingDim: 512,
  },
  attention: {
    dModel: 512,
    numHeads: 8,
    headDim: 64,
    maxSeqLen: 128,
  },
};

// ============================================================
// CharacterTokenizer
// ============================================================

/**
 * CharacterTokenizer — 实验专用的字符级分词器
 *
 * 算法：
 *   - tokenize()  — 按字符切分（每个 Unicode 字符为一个 token）
 *   - encode()    — 每个字符映射为其 Unicode code point 作为 token ID
 *   - decode()    — 将 code point 数组还原为字符串
 *   - getVocabulary() — 返回当前已见字符的映射表
 *
 * 设计说明：
 *   CharacterTokenizer 在此定义而非放入核心 tokenizer 模块，
 *   是为了遵守"零核心模块修改"约束。它仅在实验上下文中使用。
 *   当 V2 CharacterTokenizer 正式加入 tokenizer 模块时，
 *   此处的实现可替换为对正式模块的引用。
 *
 * 与 MiniTokenizer 的 API 兼容性：
 *   实现了 ICharacterTokenizer 接口，与 MiniTokenizer
 *   的 tokenize/encode/decode/getVocabulary 签名一致，
 *   TokenizerComparisonRunner 可统一调用两者。
 *
 * 限制：
 *   - 不支持特殊 token（<pad>/<unk>/<bos>/<eos>）
 *   - 无词汇表训练 — 所见字符即所得
 *   - 不在 tokenizer-registry 中注册（实验专用）
 */
export class CharacterTokenizer implements ICharacterTokenizer {
  /** 已见字符 → code point 映射 */
  private charToId: Map<string, number> = new Map();
  /** code point → 字符映射 */
  private idToChar: Map<number, string> = new Map();

  /**
   * tokenize(text) — 按字符切分文本
   *
   * 每个 Unicode 字符（包括空格、标点）为一个独立 token。
   * 空字符串返回空数组。
   *
   * 示例：
   *   tokenizer.tokenize("Hi")
   *   → ["H", "i"]
   *
   *   tokenizer.tokenize("Hi HOU")
   *   → ["H", "i", " ", "H", "O", "U"]
   */
  tokenize(text: string): string[] {
    if (!text || text.length === 0) {
      return [];
    }

    const tokens: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      tokens.push(char);

      // 注册遇到的字符（幂等）
      if (!this.charToId.has(char)) {
        const codePoint = char.codePointAt(0) ?? 0;
        this.charToId.set(char, codePoint);
        this.idToChar.set(codePoint, char);
      }
    }

    return tokens;
  }

  /**
   * encode(text) — 将文本编码为 code point 序列
   *
   * 内部调用 tokenize()，然后将每个字符映射为其 Unicode code point。
   * code point 即 token ID。
   *
   * 示例：
   *   tokenizer.encode("Hi")
   *   → [72, 105]  （H=72, i=105）
   */
  encode(text: string): number[] {
    const tokens = this.tokenize(text);
    return tokens.map((char) => {
      return this.charToId.get(char) ?? char.codePointAt(0) ?? 0;
    });
  }

  /**
   * decode(ids) — 将 code point 序列解码为文本
   *
   * 每个 code point 通过 String.fromCodePoint() 还原为字符，
   * 然后拼接为完整字符串。
   *
   * 示例：
   *   tokenizer.decode([72, 105])
   *   → "Hi"
   */
  decode(ids: number[]): string {
    return ids
      .map((id) => {
        const char = this.idToChar.get(id);
        if (char !== undefined) return char;
        // 尝试从 code point 还原
        try {
          return String.fromCodePoint(id);
        } catch {
          return "�"; // Unicode replacement character
        }
      })
      .join("");
  }

  /**
   * getVocabulary() — 获取字符 → code point 映射表
   *
   * 返回当前已见字符的完整映射。
   * 注意：size 是已编码字符的种类数，
   * 并非理论上的全部 Unicode 字符数。
   */
  getVocabulary(): {
    size: number;
    tokenToId: ReadonlyMap<string, number>;
    idToToken: ReadonlyMap<number, string>;
  } {
    return {
      size: this.charToId.size,
      tokenToId: this.charToId,
      idToToken: this.idToChar,
    };
  }
}

// ============================================================
// createExperimentContext — 工厂函数
// ============================================================

/**
 * createExperimentContext(experiment, configOverrides?)
 * — 根据实验定义创建 ExperimentContext
 *
 * 工作流程：
 *   1. 读取 experiment.requiredCapabilities.dataRequirements
 *   2. 对每个 dataRequirement，检查 module 名称
 *   3. 实例化对应模块（使用默认配置 + configOverrides）
 *   4. 对于 tokenizer 实验，额外创建 CharacterTokenizer
 *   5. 返回填充好的 ExperimentContext 值对象
 *
 * 模块创建规则：
 *   - "tokenizer"  → new MiniTokenizer() + new CharacterTokenizer()
 *   - "embedding"  → new MiniEmbedding(config)
 *   - "attention"  → new MiniAttention(config)
 *   - 其他 module 名称 → 跳过（记录到返回的 context 中，
 *     由 runner 在运行时校验）
 *
 * 设计原则：
 *   - Registry 驱动 — 不从 hardcode 列表决定创建哪些模块
 *   - 配置可覆盖 — 调用方可传入自定义配置
 *   - 显式可空 — 未创建的模块字段为 null
 *   - 无副作用 — 工厂函数不修改任何全局状态
 *
 * @param experiment      — 来自 experiment-registry 的实验定义
 * @param configOverrides — 可选的模块配置覆盖
 * @returns                填充好的 ExperimentContext
 *
 * 示例：
 *   const experiment = getExperimentById("tokenizer-comparison-lab")!;
 *   const ctx = createExperimentContext(experiment);
 *   // ctx.tokenizer !== null
 *   // ctx.charTokenizer !== null
 *   // ctx.embedding === null（tokenizer 实验不需要 embedding）
 */
export function createExperimentContext(
  experiment: MiniMindExperiment,
  configOverrides?: Partial<ExperimentModuleConfig>
): ExperimentContext {
  const requirements = experiment.requiredCapabilities.dataRequirements;
  const moduleNames = new Set(requirements.map((r) => r.module));

  const embedConfig = {
    ...DEFAULT_MODULE_CONFIG.embedding,
    ...configOverrides?.embedding,
  };
  const attnConfig = {
    ...DEFAULT_MODULE_CONFIG.attention,
    ...configOverrides?.attention,
  };

  const context: ExperimentContext = {
    experimentId: experiment.id,
    tokenizer: null,
    charTokenizer: null,
    embedding: null,
    attention: null,
  };

  // ── Tokenizer ──
  if (moduleNames.has("tokenizer")) {
    try {
      context.tokenizer = new MiniTokenizer();
      // 为对比实验预注册一些常用词
      const commonWords = [
        "hello", "world", "the", "is", "at", "in", "on", "a", "an",
        "I", "you", "he", "she", "it", "we", "they",
        "and", "or", "but", "so", "for", "with", "from",
        "this", "that", "these", "those",
        "HOU", "Universe", "MiniMind", "AI", "Lab",
      ];
      for (const word of commonWords) {
        context.tokenizer.addToken(word);
      }
      context.charTokenizer = new CharacterTokenizer();
    } catch {
      // 创建失败时保持 null — runner 会校验
      context.tokenizer = null;
      context.charTokenizer = null;
    }
  }

  // ── Embedding ──
  if (moduleNames.has("embedding")) {
    try {
      context.embedding = new MiniEmbedding(embedConfig);
    } catch {
      context.embedding = null;
    }
  }

  // ── Attention ──
  if (moduleNames.has("attention")) {
    try {
      context.attention = new MiniAttention(attnConfig);
    } catch {
      context.attention = null;
    }
  }

  return context;
}

/**
 * 从 dataRequirements 中提取需要的模块名称列表
 *
 * 纯工具函数 — 供外部消费者了解某个实验需要哪些模块。
 *
 * @param requirements — 来自 experiment.requiredCapabilities.dataRequirements
 * @returns             模块名称数组（去重）
 */
export function getRequiredModuleNames(
  requirements: ExperimentDataRequirement[]
): string[] {
  return [...new Set(requirements.map((r) => r.module))];
}

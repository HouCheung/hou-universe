// ============================================================
// MiniMind — data/TextDataset.ts
// ============================================================
// TextDataset — 文本语料库 → Causal LM 训练样本
//
// 核心功能：
//   1. 接受原始文本语料（单文档或多文档）
//   2. 使用注入的 MiniTokenizer 将文本编码为 token ID 序列
//   3. 将 token 序列切分为固定长度的因果语言模型样本
//   4. 每个样本包含 inputIds 和 targetIds（PyTorch 风格：target 偏移 1 位）
//
// Causal LM 样本格式（blockSize=4 示例）：
//   tokens = [1, 2, 3, 4, 5, 6, 7, 8, 9]
//   Sample 0: inputIds=[1,2,3,4], targetIds=[2,3,4,5]
//   Sample 1: inputIds=[5,6,7,8], targetIds=[6,7,8,9]
//
// 多文档处理：
//   多个文档的 token 序列被拼接在一起（可选插入分隔 token），
//   然后统一按 blockSize 切分。文档边界可能出现在样本内部 —
//   这与标准 LLM 预训练行为一致。
//
// 使用方式：
//
// ```ts
// const tokenizer = new MiniTokenizer();
// // 注册词汇...
//
// const dataset = new TextDataset({
//   tokenizer,
//   corpus: ["hello world", "the model learns"],
//   blockSize: 4,
// });
//
// console.log(dataset.length()); // → 样本数
// const sample = dataset.get(0);
// // sample.inputIds  → [id(hello), id(world), id(the), id(model)]
// // sample.targetIds → [id(world), id(the), id(model), id(learns)]
// ```
//
// 设计原则：
//   - 依赖注入 — Tokenizer 由外部提供，不创建内部实例
//   - PyTorch 风格 — targetIds = inputIds 右移一位
//   - 不可变 — 构造后样本固定
//   - 确定性 — 相同输入 → 相同样本序列
// ============================================================

import { Dataset } from "./Dataset";
import type { ITokenizer } from "./ITokenizer";

/**
 * 单个 Causal LM 训练样本
 *
 * inputIds 和 targetIds 长度相同（均为 blockSize）。
 * targetIds[i] 是 inputIds[i] 的预测目标 —
 * 即 targetIds 是 inputIds 右移一位的结果。
 *
 * mask（可选，仅 document-aligned 布局产生）：
 *   与预测位置对齐的长度 = blockSize 的 0/1 数组。
 *   mask[s] = 1 表示“预测 inputIds[s+1]”是一个有效目标
 *   （目标 token 是文档内的真实 token，未跨越文档边界）；
 *   mask[s] = 0 表示该位置必须被损失函数忽略（填充位置）。
 *   最后一个位置（s = blockSize-1）没有目标，恒为 0。
 */
export interface TextSample {
  /** Token ID 序列 — 模型输入，长度 = blockSize */
  inputIds: number[];
  /** Token ID 序列 — 预测目标，长度 = blockSize（相对于 inputIds 右移一位） */
  targetIds: number[];
  /**
   * 位置掩码（可选）— mask[s] = 1 表示预测位置 s 计入损失，
   * mask[s] = 0 表示忽略。仅 document-aligned 布局产生；
   * 拼接布局下为 undefined（等价于全 1）。
   */
  mask?: number[];
}

/**
 * TextDataset 配置选项
 */
export interface TextDatasetOptions {
  /** Tokenizer 实例 — 依赖注入，用于文本编码（MiniTokenizer 或 BPETokenizer） */
  tokenizer: ITokenizer;
  /** 文本语料 — 单文档（string）或多文档（string[]） */
  corpus: string | string[];
  /** 每个样本的 token 序列长度 — 必须 >= 2 */
  blockSize: number;
  /** 多文档之间是否插入 <eos> 分隔符，默认 true（仅 concatenated 布局） */
  insertEos?: boolean;
  /** 滑动窗口步长 — 默认等于 blockSize（非重叠切分） */
  stride?: number;
  /**
   * 序列布局 — 控制训练序列如何由文档构成（Phase 90）。
   *   "concatenated"（默认）— 所有文档拼接为单一 token 流，按 blockSize 切窗。
   *                            窗口可能跨越文档边界（与标准 LLM 预训练一致）。
   *   "document-aligned"    — 每个文档独立编码为一个 blockSize 窗口，
   *                            短文档用 padTokenId 填充，mask 标记有效位置。
   *                            训练目标只包含文档内 next-token 对，不产生跨文档目标。
   */
  layout?: "concatenated" | "document-aligned";
  /** 文档对齐布局的填充 token ID（默认 0 = <pad>） */
  padTokenId?: number;
}

/**
 * document-aligned 布局的默认填充 token ID。
 * 0 对应 BPETokenizer / MiniTokenizer 词汇表中的 <pad>（专用特殊 token，
 * 不会出现在真实文档编码中 — 真实 token 从 4 开始）。
 */
export const DEFAULT_PAD_TOKEN_ID = 0;

/**
 * TextDataset — 文本语料库 → Causal LM 样本
 *
 * 核心职责：
 *   将原始文本语料转换为可用于 Causal LM 训练的 token 样本序列。
 *   Tokenizer 由外部注入，遵循依赖反转原则。
 *
 * 数据流：
 *   Text[] → Tokenizer.encode() → Token IDs[] → Chunk(blockSize) → TextSample[]
 *
 * 教育重点：
 *   - 展示文本数据如何被编码为模型可消费的数字序列
 *   - 展示因果语言建模的输入/目标偏移关系
 *   - 展示 blockSize 如何影响样本数量
 *   - 多文档拼接策略与真实预训练一致
 *
 * Phase 90 — document-aligned 布局：
 *   当 layout="document-aligned" 时，每个文档被独立编码为一个 blockSize
 *   窗口（短文档用 padTokenId 填充），样本携带 mask。训练目标只包含文档内
 *   next-token 对，不产生跨文档预测目标 — 与能力评估器（measureMemorization）
 *   的逐文档评估布局一致。
 */
export class TextDataset extends Dataset<TextSample> {
  private samples: TextSample[];
  private blockSize: number;
  private tokenizer: ITokenizer;
  private effectiveStride: number;
  private layout: "concatenated" | "document-aligned";
  private padTokenId: number;

  /**
   * @param options — 配置选项（tokenizer, corpus, blockSize, …）
   *
   * 构造时立即：
   *   1. 编码所有文本为 token ID 序列
   *   2. 拼接多文档（可选 EOS 分隔）或按文档对齐构建样本
   *   3. 按 blockSize 切分为 TextSample[]
   *
   * 验证规则：
   *   - blockSize >= 2（至少需要 2 个 token 才能形成因果样本）
   *   - corpus 不能为空
   *   - 编码后的 token 序列必须至少包含 blockSize+1 个 token
   */
  constructor(options: TextDatasetOptions) {
    super();

    const {
      tokenizer,
      corpus,
      blockSize,
      insertEos = true,
      stride,
      layout = "concatenated",
      padTokenId = DEFAULT_PAD_TOKEN_ID,
    } = options;

    // ── 参数验证 ──
    if (blockSize < 2) {
      throw new Error(
        `TextDataset: blockSize must be >= 2, got ${blockSize}. ` +
          `Need at least 2 tokens for causal input/target pair.`
      );
    }

    const texts = Array.isArray(corpus) ? corpus : [corpus];
    if (texts.length === 0) {
      throw new Error("TextDataset: corpus must not be empty");
    }

    const effectiveStride = stride ?? blockSize;
    if (effectiveStride <= 0) {
      throw new Error(
        `TextDataset: stride must be > 0, got ${effectiveStride}`
      );
    }

    this.blockSize = blockSize;
    this.tokenizer = tokenizer;
    this.effectiveStride = effectiveStride;
    this.layout = layout;
    this.padTokenId = padTokenId;

    if (layout === "document-aligned") {
      // ── 文档对齐布局 ──
      // 每个文档独立编码 → 独立窗口 → mask 标记有效预测位置。
      // 不拼接文档，不产生跨文档目标。
      this.samples = this.buildDocumentAlignedSamples(
        texts,
        tokenizer,
        blockSize,
        effectiveStride,
        padTokenId
      );
    } else {
      // ── 拼接布局（生产默认） ──
      const allTokenIds = this.encodeAndConcat(texts, tokenizer, insertEos);

      // ── 切分为因果样本 ──
      // 如果 token 不足以构成至少一个样本，返回空数据集（不抛出异常）
      this.samples = allTokenIds.length >= blockSize + 1
        ? this.chunkIntoSamples(allTokenIds, blockSize, effectiveStride)
        : [];
    }
  }

  // ============================================================
  // 公开 API — Dataset 实现
  // ============================================================

  /**
   * length() — 返回样本总数
   */
  length(): number {
    return this.samples.length;
  }

  /**
   * get(index) — 按索引获取单个样本
   *
   * 返回样本的深拷贝，防止外部修改内部状态。
   *
   * @param index — 0-based 样本索引
   * @throws 如果 index 越界
   */
  get(index: number): TextSample {
    if (index < 0 || index >= this.samples.length) {
      throw new Error(
        `TextDataset.get: index ${index} out of range [0, ${this.samples.length})`
      );
    }
    const sample = this.samples[index];
    return {
      inputIds: [...sample.inputIds],
      targetIds: [...sample.targetIds],
      ...(sample.mask ? { mask: [...sample.mask] } : {}),
    };
  }

  // ============================================================
  // 公开 API — 信息访问
  // ============================================================

  /**
   * getBlockSize() — 返回配置的 blockSize
   */
  getBlockSize(): number {
    return this.blockSize;
  }

  /**
   * getTokenizer() — 返回注入的 Tokenizer 实例
   */
  getTokenizer(): ITokenizer {
    return this.tokenizer;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * encodeAndConcat — 编码所有文档并拼接为单个 token 序列
   *
   * 多文档处理：
   *   如果 insertEos=true 且 tokenizer 词表中存在 <eos>，
   *   则在文档之间插入 <eos> 的 token ID 作为分隔符。
   *   否则直接拼接。
   *
   * @param texts     — 原始文本数组
   * @param tokenizer — MiniTokenizer 实例
   * @param insertEos — 是否在文档间插入 <eos>
   * @returns 拼接后的完整 token ID 序列
   */
  private encodeAndConcat(
    texts: string[],
    tokenizer: ITokenizer,
    insertEos: boolean
  ): number[] {
    const allIds: number[] = [];

    // 尝试获取 <eos> token ID（用于文档分隔）
    let eosId: number | undefined;
    if (insertEos) {
      const vocab = tokenizer.getVocabulary();
      eosId = vocab.tokenToId.get("<eos>");
    }

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

      // 跳过空文本
      if (!text || text.trim().length === 0) {
        continue;
      }

      const ids = tokenizer.encode(text);

      // 跳过空编码结果
      if (ids.length === 0) {
        continue;
      }

      allIds.push(...ids);

      // 文档间插入 <eos> 分隔符（非最后一篇）
      if (eosId !== undefined && i < texts.length - 1) {
        allIds.push(eosId);
      }
    }

    return allIds;
  }

  /**
   * chunkIntoSamples — 将 token 序列切分为因果样本
   *
   * 算法（PyTorch 风格）：
   *   对每个起始位置 i（步长 = stride）：
   *     inputIds  = tokens[i      : i + blockSize]
   *     targetIds = tokens[i + 1  : i + blockSize + 1]
   *
   *   如果剩余 token 不足以构成完整样本，则停止。
   *
   * @param tokens    — 完整 token ID 序列
   * @param blockSize — 每个样本的 token 长度
   * @param stride    — 样本之间的步长
   * @returns TextSample 数组
   */
  private chunkIntoSamples(
    tokens: number[],
    blockSize: number,
    stride: number
  ): TextSample[] {
    const samples: TextSample[] = [];

    // 每个样本需要 blockSize + 1 个 token
    // （blockSize 个用于 inputIds，额外 1 个用于 target 偏移）
    const sampleSpan = blockSize + 1;

    for (let i = 0; i + sampleSpan <= tokens.length; i += stride) {
      const inputIds = tokens.slice(i, i + blockSize);
      const targetIds = tokens.slice(i + 1, i + blockSize + 1);
      samples.push({ inputIds, targetIds });
    }

    return samples;
  }

  /**
   * buildDocumentAlignedSamples — 文档对齐布局的样本构建（Phase 90）
   *
   * 算法（每个文档独立）：
   *   1. 独立编码文档 → token 序列 ids[0..N-1]
   *   2. 以 stride 步长切分出非重叠的 blockSize 窗口
   *      （窗口长度不足 blockSize 时用 padTokenId 填充）
   *   3. 每个窗口生成 TextSample：
   *        inputIds[s] = 文档 token（越界为 padTokenId）
   *        targetIds[s] = inputIds[s+1]（保持 TextSample 预偏移契约）
   *        mask[s] = 1 ⟺ 预测 inputIds[s+1] 是文档内真实 token（s+1 < N）
   *
   * 关键保证：
   *   - 不拼接文档 — 每个样本只包含单个文档的 token
   *   - 不产生跨文档目标 — 所有 mask=1 的位置都落在同一文档内
   *   - 填充位置不计入损失 — mask=0 的位置由损失函数忽略
   *   - 确定性 — 相同输入 → 相同样本序列（无随机性）
   *
   * @param texts     — 原始文本数组
   * @param tokenizer — MiniTokenizer / BPETokenizer 实例
   * @param blockSize — 每个样本的 token 长度
   * @param stride    — 窗口步长（默认 = blockSize）
   * @param padId     — 填充 token ID
   * @returns TextSample 数组（带 mask）
   */
  private buildDocumentAlignedSamples(
    texts: string[],
    tokenizer: ITokenizer,
    blockSize: number,
    stride: number,
    padId: number
  ): TextSample[] {
    const samples: TextSample[] = [];

    for (const text of texts) {
      // 跳过空文本
      if (!text || text.trim().length === 0) {
        continue;
      }

      const ids = tokenizer.encode(text);

      // 跳过空编码结果
      if (ids.length === 0) {
        continue;
      }

      const docLen = ids.length;

      // 非重叠窗口：窗口起点 i 需要至少一个有效 next-token 对
      // （i+1 < docLen），否则窗口不含任何有效预测位置，跳过。
      for (let i = 0; i + 1 < docLen; i += stride) {
        const inputIds = new Array<number>(blockSize);
        const targetIds = new Array<number>(blockSize);
        const mask = new Array<number>(blockSize).fill(0);

        // 窗口输入：文档 token，越界填充 padId
        for (let s = 0; s < blockSize; s++) {
          const pos = i + s;
          inputIds[s] = pos < docLen ? ids[pos] : padId;
        }

        // TextSample 预偏移契约：targetIds[s] = inputIds[s+1]
        // （最后一个槽位无后续 token，用 padId 占位，永不被使用）
        for (let s = 0; s < blockSize - 1; s++) {
          targetIds[s] = inputIds[s + 1];
        }
        targetIds[blockSize - 1] = padId;

        // 掩码：mask[s] = 1 ⟺ 目标 inputIds[s+1] 是文档内真实 token
        // 最后一个位置（s = blockSize-1）没有目标，恒为 0。
        for (let s = 0; s < blockSize - 1; s++) {
          mask[s] = i + s + 1 < docLen ? 1 : 0;
        }
        mask[blockSize - 1] = 0;

        samples.push({ inputIds, targetIds, mask });
      }
    }

    return samples;
  }
}

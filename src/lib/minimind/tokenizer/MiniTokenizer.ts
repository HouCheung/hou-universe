// ============================================================
// MiniMind — MiniTokenizer.ts
// ============================================================
// MiniTokenizer V1 — 最简单的 Word Tokenizer
//
// 算法流程：
//   tokenize()        文本 → token 数组（空格切分，未知词 → <unk>）
//   encode()          文本 → id 数组（tokenize → vocabulary 查表）
//   decode()          id 数组 → 文本（查表 → 空格拼接）
//
// V1 规则：
//   - 空格切分（不处理标点粘连，留到 V2 改进）
//   - 未知词统一映射为 <unk>
//   - 支持 <pad> <unk> <bos> <eos> 四个特殊 token
// ============================================================

import { Vocabulary } from "./vocabulary";
import type { ExplainResult, TokenInfo } from "./types";

/**
 * MiniTokenizer 配置选项
 */
export interface MiniTokenizerOptions {
  /** 是否在编码时自动添加 <bos> 和 <eos>，默认 false */
  addSpecialTokens?: boolean;
  /** 未知词回退 token，默认 "<unk>" */
  unkToken?: string;
}

export class MiniTokenizer {
  private vocabulary: Vocabulary;
  private options: Required<MiniTokenizerOptions>;

  constructor(options: MiniTokenizerOptions = {}) {
    this.vocabulary = new Vocabulary();
    this.options = {
      addSpecialTokens: options.addSpecialTokens ?? false,
      unkToken: options.unkToken ?? "<unk>",
    };
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * tokenize(text) — 将文本切分为 token 数组
   *
   * 规则：
   *   1. 按空白字符切分（连续空格会产生空 token，需过滤）
   *   2. 不在 vocabulary 中的词统一替换为 <unk>
   *
   * 示例：
   *   tokenizer.tokenize("hello world")
   *   → ["hello", "world"]
   */
  tokenize(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // 按空白切分并过滤空串
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    // 未知词 → <unk>
    return words.map((word) => {
      if (this.vocabulary.has(word)) {
        return word;
      }
      // 未知 token — 返回 unkToken（默认 "<unk>"）
      return this.options.unkToken;
    });
  }

  /**
   * encode(text) — 将文本转换为 id 序列
   *
   * 内部调用 tokenize()，然后将每个 token 映射为 id。
   * 未知词使用 vocabulary 中的 <unk> id。
   *
   * 如果 options.addSpecialTokens = true，会在序列
   * 首尾附加 <bos> / <eos> 对应的 id。
   *
   * 示例：
   *   tokenizer.encode("hello world")
   *   → [4, 5]（假设 hello→4, world→5 已注册）
   */
  encode(text: string): number[] {
    const tokens = this.tokenize(text);
    const unkId = this.vocabulary.getUnkId();

    const ids: number[] = [];

    if (this.options.addSpecialTokens) {
      const bosId = this.vocabulary.getId("<bos>");
      if (bosId !== undefined) {
        ids.push(bosId);
      }
    }

    for (const token of tokens) {
      const id = this.vocabulary.getId(token);
      ids.push(id ?? unkId);
    }

    if (this.options.addSpecialTokens) {
      const eosId = this.vocabulary.getId("<eos>");
      if (eosId !== undefined) {
        ids.push(eosId);
      }
    }

    return ids;
  }

  /**
   * decode(ids) — 将 id 序列还原为文本
   *
   * 将每个 id 映射回 token，然后用空格拼接。
   * 未知 id 输出 "<unk>"。
   *
   * 示例：
   *   tokenizer.decode([4, 5])
   *   → "hello world"
   */
  decode(ids: number[]): string {
    const tokens = ids.map((id) => {
      const token = this.vocabulary.getToken(id);
      return token ?? this.options.unkToken;
    });

    return tokens.join(" ");
  }

  /**
   * explain(text) — 可解释的 tokenization 分析
   *
   * 内部直接调用 tokenize()、encode()、decode()，
   * 保持单一职责，不重复实现编码逻辑。
   *
   * 返回 ExplainResult，包含：
   *   - originalText    原始输入
   *   - tokens          逐 token 详情（token / id / exists）
   *   - unknownTokens   未知词列表
   *   - encoded         encode() 输出的 id 序列
   *   - decoded         decode() 输出的往返文本
   *
   * 示例：
   *   tokenizer.explain("hello unknown world")
   *   → {
   *       originalText: "hello unknown world",
   *       tokens: [
   *         { token: "hello", id: 4, exists: true },
   *         { token: "<unk>", id: 1, exists: false },
   *         { token: "world", id: 5, exists: true },
   *       ],
   *       unknownTokens: ["unknown"],
   *       encoded: [4, 1, 5],
   *       decoded: "hello <unk> world",
   *     }
   */
  explain(text: string): ExplainResult {
    // 原始单词列表（按空白切分，与 tokenize 内部逻辑一致）
    const rawWords =
      text && text.trim().length > 0
        ? text.split(/\s+/).filter((w) => w.length > 0)
        : [];

    // 调用已有 API — 保持单一职责，不重复实现
    const tokenizedTokens = this.tokenize(text);
    const encoded = this.encode(text);
    const decoded = this.decode(encoded);

    const unkId = this.vocabulary.getUnkId();

    // 构建逐 token 信息
    const tokens: TokenInfo[] = rawWords.map((rawWord, i) => {
      const token = tokenizedTokens[i] ?? this.options.unkToken;
      const exists = this.vocabulary.has(rawWord);
      const id = exists
        ? (this.vocabulary.getId(token) ?? unkId)
        : unkId;

      return { token, id, exists };
    });

    // 收集所有不在 vocabulary 中的原始单词
    const unknownTokens = rawWords.filter(
      (word) => !this.vocabulary.has(word)
    );

    return {
      originalText: text,
      tokens,
      unknownTokens,
      encoded,
      decoded,
    };
  }

  /**
   * getVocabulary() — 获取当前 vocabulary 信息
   *
   * 返回 vocabulary 大小和完整映射表（只读）。
   */
  getVocabulary(): {
    size: number;
    tokenToId: ReadonlyMap<string, number>;
    idToToken: ReadonlyMap<number, string>;
  } {
    return {
      size: this.vocabulary.size,
      tokenToId: this.vocabulary.getTokenToIdMap(),
      idToToken: this.vocabulary.getIdToTokenMap(),
    };
  }

  /**
   * addToken(token) — 向 vocabulary 注册新 token
   *
   * 幂等：重复添加同一个 token 不会报错，返回已有的 id。
   *
   * 示例：
   *   tokenizer.addToken("hello")   // → 4
   *   tokenizer.addToken("hello")   // → 4（幂等）
   */
  addToken(token: string): number {
    return this.vocabulary.add(token);
  }
}

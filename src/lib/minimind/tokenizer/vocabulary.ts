// ============================================================
// MiniMind — vocabulary.ts
// ============================================================
// 职责：
//   1. 维护 token ⇄ id 的双向映射
//   2. 提供默认特殊 token（<pad> <unk> <bos> <eos>）
//   3. 暴露添加自定义 token 的能力
//
// 设计上刻意保持简单，不做 BPE / 子词切分。
// 未来版本可从外部文件加载更大的 vocabulary。
// ============================================================

/** 默认特殊 token 列表 */
export const DEFAULT_SPECIAL_TOKENS = [
  "<pad>",
  "<unk>",
  "<bos>",
  "<eos>",
] as const;

export type SpecialToken = (typeof DEFAULT_SPECIAL_TOKENS)[number];

/** 特殊 token → 固定 id 映射，保证跨会话一致 */
export const SPECIAL_TOKEN_TO_ID: Record<SpecialToken, number> = {
  "<pad>": 0,
  "<unk>": 1,
  "<bos>": 2,
  "<eos>": 3,
};

/**
 * Vocabulary 类
 *
 * 维护 token ⇄ id 双映射，所有查询均为 O(1)。
 */
export class Vocabulary {
  /** token → id */
  private tokenToId: Map<string, number>;
  /** id → token */
  private idToToken: Map<number, string>;
  /** 下一个可用 id（从特殊 token 数量之后开始） */
  private nextId: number;

  constructor() {
    this.tokenToId = new Map();
    this.idToToken = new Map();

    // 注册默认特殊 token
    for (const token of DEFAULT_SPECIAL_TOKENS) {
      const id = SPECIAL_TOKEN_TO_ID[token as SpecialToken];
      this.tokenToId.set(token, id);
      this.idToToken.set(id, token);
    }

    this.nextId = DEFAULT_SPECIAL_TOKENS.length;
  }

  /** 返回当前 vocabulary 大小 */
  get size(): number {
    return this.tokenToId.size;
  }

  /** 检查 token 是否已存在 */
  has(token: string): boolean {
    return this.tokenToId.has(token);
  }

  /** 根据 token 获取 id，不存在返回 undefined */
  getId(token: string): number | undefined {
    return this.tokenToId.get(token);
  }

  /** 根据 id 获取 token，不存在返回 undefined */
  getToken(id: number): string | undefined {
    return this.idToToken.get(id);
  }

  /**
   * 添加新 token
   *
   * 如果 token 已存在则静默跳过（幂等）。
   * 返回分配的 id。
   */
  add(token: string): number {
    const existing = this.tokenToId.get(token);
    if (existing !== undefined) {
      return existing;
    }

    const id = this.nextId++;
    this.tokenToId.set(token, id);
    this.idToToken.set(id, token);
    return id;
  }

  /** 获取 <unk> token 的 id，用于未知词回退 */
  getUnkId(): number {
    return SPECIAL_TOKEN_TO_ID["<unk>"];
  }

  /** 获取完整 token → id 映射的只读视图 */
  getTokenToIdMap(): ReadonlyMap<string, number> {
    return this.tokenToId;
  }

  /** 获取完整 id → token 映射的只读视图 */
  getIdToTokenMap(): ReadonlyMap<number, string> {
    return this.idToToken;
  }
}

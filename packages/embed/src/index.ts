/**
 * @dream-xi/embed — 文本嵌入向量工具库
 *
 * 为 Dream XI AI 球员提供向量嵌入的数学运算与内存向量存储能力，
 * 支持 RAG（检索增强生成）工作流的语义相似度检索。
 *
 * 核心能力：
 * - 向量基础运算（点积、L2 范数、归一化、余弦相似度、欧氏距离）
 * - 内存向量存储（VectorStore）：增删查，支持元数据
 * - Top-K 最近邻检索（余弦相似度 / 欧氏距离两种度量）
 *
 * @example 余弦相似度
 * ```ts
 * const sim = cosineSimilarity([1, 0, 0], [0.8, 0.6, 0]);
 * console.log(sim); // ~0.8
 * ```
 *
 * @example 内存向量存储 + 检索
 * ```ts
 * const store = new VectorStore<{ text: string }>();
 *
 * store.add("doc-1", [0.1, 0.9, 0.3], { text: "梅西的传球技巧" });
 * store.add("doc-2", [0.8, 0.1, 0.5], { text: "C罗的射门训练" });
 *
 * const queryVec = [0.15, 0.85, 0.4];
 * const results = store.search(queryVec, { topK: 1 });
 * console.log(results[0]?.metadata.text); // "梅西的传球技巧"
 * ```
 */

/** 浮点数向量类型（只读，防止意外修改） */
export type Vector = readonly number[];

// ─────────────────────────────────────────────────────────────────────────────
// 向量基础运算
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 向量点积（Dot Product）
 *
 * @throws {Error} 维度不一致时抛出
 */
export function dotProduct(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`dotProduct: dimension mismatch (${a.length} vs ${b.length})`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/**
 * 向量 L2 范数（欧氏长度）
 */
export function magnitude(v: Vector): number {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

/**
 * 归一化向量（使 L2 范数 = 1）
 *
 * @returns 归一化后的新向量；若输入为零向量，返回全零向量
 */
export function normalize(v: Vector): number[] {
  const mag = magnitude(v);
  if (mag === 0) return Array.from(v).map(() => 0);
  return Array.from(v).map((x) => x / mag);
}

/**
 * 余弦相似度（Cosine Similarity）
 *
 * 返回值范围：[-1, 1]，1 表示完全相同方向，-1 表示完全相反。
 *
 * @throws {Error} 维度不一致时抛出
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/**
 * 欧氏距离（Euclidean Distance）
 *
 * @throws {Error} 维度不一致时抛出
 */
export function euclideanDistance(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`euclideanDistance: dimension mismatch (${a.length} vs ${b.length})`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(sum);
}

/**
 * 向量加法（逐元素相加）
 */
export function add(a: Vector, b: Vector): number[] {
  if (a.length !== b.length) throw new Error("add: dimension mismatch");
  return Array.from(a).map((x, i) => x + (b[i] ?? 0));
}

/**
 * 向量均值（对多个向量求均值，适合嵌入聚合）
 */
export function mean(vectors: Vector[]): number[] {
  if (vectors.length === 0) throw new Error("mean: empty vector array");
  const dim = vectors[0]?.length ?? 0;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error("mean: dimension mismatch");
    for (let i = 0; i < dim; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
  }
  return sum.map((x) => x / vectors.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// VectorStore — 内存向量存储
// ─────────────────────────────────────────────────────────────────────────────

/** 向量存储条目 */
export interface VectorEntry<TMeta = Record<string, unknown>> {
  /** 文档唯一 ID */
  id: string;
  /** 向量 */
  vector: number[];
  /** 自定义元数据 */
  metadata: TMeta;
  /** 插入时间戳 */
  addedAt: number;
}

/** 检索结果 */
export interface SearchResult<TMeta = Record<string, unknown>> {
  /** 文档 ID */
  id: string;
  /** 相似度得分（余弦相似度 ∈ [-1,1]，或欧氏距离 ≥ 0） */
  score: number;
  /** 自定义元数据 */
  metadata: TMeta;
  /** 原始向量 */
  vector: number[];
}

/** 检索配置 */
export interface SearchOptions {
  /** 返回最相似的 K 条结果，默认 5 */
  topK?: number;
  /**
   * 相似度度量
   * - `cosine`（默认）：余弦相似度，值越大越相似
   * - `euclidean`：欧氏距离，值越小越相似（结果按距离升序）
   */
  metric?: "cosine" | "euclidean";
  /** 最低分数阈值（cosine 模式：最低相似度；euclidean 模式：最大距离） */
  minScore?: number;
}

/**
 * 内存向量存储
 *
 * 泛型参数 `TMeta` 定义每条记录的元数据类型。
 *
 * @example
 * ```ts
 * const store = new VectorStore<{ title: string; source: string }>();
 * store.add("chunk-1", embeddingVector, { title: "战术手册第一章", source: "tactics.md" });
 * const hits = store.search(queryVector, { topK: 3, metric: "cosine" });
 * ```
 */
export class VectorStore<TMeta = Record<string, unknown>> {
  private readonly entries = new Map<string, VectorEntry<TMeta>>();

  // ─── CRUD ────────────────────────────────────────────────────────────────

  /**
   * 添加或更新一个向量条目
   *
   * @param id 唯一标识
   * @param vector 嵌入向量
   * @param metadata 关联元数据
   */
  add(id: string, vector: Vector, metadata: TMeta): this {
    this.entries.set(id, {
      id,
      vector: Array.from(vector),
      metadata,
      addedAt: Date.now(),
    });
    return this;
  }

  /**
   * 删除指定 ID 的条目
   */
  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * 获取指定 ID 的条目
   */
  get(id: string): VectorEntry<TMeta> | undefined {
    return this.entries.get(id);
  }

  /**
   * 检查是否存在
   */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * 清空所有条目
   */
  clear(): void {
    this.entries.clear();
  }

  /** 当前存储的向量总数 */
  get size(): number {
    return this.entries.size;
  }

  // ─── 检索 ────────────────────────────────────────────────────────────────

  /**
   * Top-K 近邻检索
   *
   * @param query 查询向量（须与存储向量维度一致）
   * @param options 检索配置
   */
  search(query: Vector, options: SearchOptions = {}): SearchResult<TMeta>[] {
    const { topK = 5, metric = "cosine", minScore } = options;

    const results: SearchResult<TMeta>[] = [];

    for (const entry of this.entries.values()) {
      let score: number;
      if (metric === "cosine") {
        score = cosineSimilarity(query, entry.vector);
      } else {
        score = euclideanDistance(query, entry.vector);
      }

      if (minScore !== undefined) {
        if (metric === "cosine" && score < minScore) continue;
        if (metric === "euclidean" && score > minScore) continue;
      }

      results.push({ id: entry.id, score, metadata: entry.metadata, vector: entry.vector });
    }

    // cosine：降序（越大越相似）；euclidean：升序（越小越近）
    results.sort((a, b) => (metric === "cosine" ? b.score - a.score : a.score - b.score));

    return results.slice(0, topK);
  }

  /**
   * 导出所有条目列表（按插入时间排序）
   */
  list(): VectorEntry<TMeta>[] {
    return Array.from(this.entries.values()).sort((a, b) => a.addedAt - b.addedAt);
  }
}

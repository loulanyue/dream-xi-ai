/**
 * @dream-xi/memory — 情景记忆存储（Episodic Memory Store）
 *
 * 跨线程的决策摘要存储，支持两种后端：
 *   - Redis（生产环境，持久化）
 *   - 内存（开发/测试，重启后丢失）
 *
 * 对应 `pnpm start --memory` 的内存模式设计。
 *
 * 参考：docs/ARCHITECTURE.md § ADR-002、ADR-006
 * 参考：.env.example REDIS_URL 配置
 */

import type {
  EpisodicMemoryEntry,
  MemoryConfig,
  MemoryId,
  PlayerId,
  ThreadId,
} from "@dream-xi/types";

// ─────────────────────────────────────────────────────────────────────────────
// 存储后端接口（Redis 可替换设计）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 情景记忆后端接口
 *
 * 生产环境实现 RedisEpisodicBackend，开发环境使用 InMemoryEpisodicBackend。
 * 参考：docs/ARCHITECTURE.md § ADR-006（Redis 可选化）
 */
export interface EpisodicBackend {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内存后端实现（--memory 模式）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 内存后端实现
 *
 * 用于 `pnpm start --memory` 或测试环境。
 * 重启后数据丢失（遵循 SETUP.md 中的文档说明）。
 */
export class InMemoryEpisodicBackend implements EpisodicBackend {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (entry === undefined) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async keys(pattern: string): Promise<string[]> {
    // 简单前缀匹配（替代 Redis KEYS 的 glob 匹配）
    const prefix = pattern.replace(/\*$/, "");
    return Array.from(this.store.keys()).filter((k) => k.startsWith(prefix));
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** 获取存储条目数（测试用） */
  get size(): number {
    return this.store.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 情景记忆存储
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 保存情景记忆的选项
 */
export interface SaveEpisodicOptions {
  playerId: PlayerId;
  sourceThreadId: ThreadId;
  threadSummary: string;
  keyDecisions: string[];
  lessonsLearned: string[];
  importance?: number;
  tags?: string[];
}

/**
 * 情景记忆查询选项
 */
export interface QueryEpisodicOptions {
  playerId: PlayerId;
  /** 限制返回条数（默认 10） */
  limit?: number;
  /** 最低重要性阈值（0-1） */
  minImportance?: number;
  /** 标签过滤 */
  tags?: string[];
}

/**
 * 情景记忆存储
 *
 * 负责跨线程的会话摘要持久化，支持按球员查询历史经验。
 *
 * @example
 * ```ts
 * // 内存模式（开发/测试）
 * const store = new EpisodicMemoryStore(config, new InMemoryEpisodicBackend());
 *
 * // 保存一段线程的关键经验
 * await store.save({
 *   playerId: "leo",
 *   sourceThreadId: "thread-abc",
 *   threadSummary: "完成了用户认证模块的架构设计",
 *   keyDecisions: ["使用 JWT 而非 Session", "引入 Redis 存储 refresh token"],
 *   lessonsLearned: ["先设计接口再实现，避免返工"],
 * });
 *
 * // 查询 Leo 最近的经验
 * const memories = await store.query({ playerId: "leo", limit: 5 });
 * ```
 */
export class EpisodicMemoryStore {
  private readonly backend: EpisodicBackend;
  private readonly config: MemoryConfig;

  constructor(config: MemoryConfig, backend?: EpisodicBackend) {
    this.config = config;
    // 若未提供 backend，默认使用内存后端
    this.backend = backend ?? new InMemoryEpisodicBackend();
  }

  /**
   * 保存情景记忆
   */
  async save(options: SaveEpisodicOptions): Promise<EpisodicMemoryEntry> {
    const id = generateMemoryId();
    const now = new Date();

    const entry: EpisodicMemoryEntry = {
      id,
      layer: "episodic",
      playerId: options.playerId,
      threadId: options.sourceThreadId,
      sourceThreadId: options.sourceThreadId,
      threadSummary: options.threadSummary,
      keyDecisions: options.keyDecisions,
      lessonsLearned: options.lessonsLearned,
      content: [options.threadSummary, ...options.keyDecisions].join("\n"),
      importance: options.importance ?? 0.5,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.episodicMemoryTtlSeconds * 1000),
      tags: options.tags ?? [],
    };

    const key = this.buildKey(options.playerId, id);
    await this.backend.set(key, JSON.stringify(entry), this.config.episodicMemoryTtlSeconds);

    return entry;
  }

  /**
   * 根据 ID 获取情景记忆
   */
  async getById(playerId: PlayerId, memoryId: MemoryId): Promise<EpisodicMemoryEntry | null> {
    const key = this.buildKey(playerId, memoryId);
    const raw = await this.backend.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as EpisodicMemoryEntry;
  }

  /**
   * 查询球员的情景记忆列表
   */
  async query(options: QueryEpisodicOptions): Promise<EpisodicMemoryEntry[]> {
    const { playerId, limit = 10, minImportance = 0, tags = [] } = options;

    // 获取该球员的所有记忆 key
    const pattern = `episodic:${playerId}:*`;
    const keys = await this.backend.keys(pattern);

    // 并行获取所有记忆
    const rawEntries = await Promise.all(keys.map((k) => this.backend.get(k)));
    const entries = rawEntries
      .filter((r): r is string => r !== null)
      .map((r) => JSON.parse(r) as EpisodicMemoryEntry);

    // 过滤
    const filtered = entries.filter((e) => {
      if (e.importance < minImportance) return false;
      if (tags.length > 0 && !tags.some((t) => e.tags.includes(t))) return false;
      return true;
    });

    // 按重要性 × 时间衰减排序
    const scored = filtered.map((e) => ({
      entry: e,
      score: this.computeScore(e),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.entry);
  }

  /**
   * 删除指定情景记忆
   */
  async delete(playerId: PlayerId, memoryId: MemoryId): Promise<void> {
    const key = this.buildKey(playerId, memoryId);
    await this.backend.del(key);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 私有方法
  // ─────────────────────────────────────────────────────────────────────────

  private buildKey(playerId: PlayerId, memoryId: MemoryId): string {
    return `episodic:${playerId}:${memoryId}`;
  }

  /**
   * 综合评分：重要性 × 时间衰减（半衰期 7 天）
   */
  private computeScore(entry: EpisodicMemoryEntry): number {
    const ageMs = Date.now() - new Date(entry.createdAt).getTime();
    const halfLifeMs = 7 * 24 * 60 * 60 * 1000; // 7 天
    const decayFactor = Math.exp((-Math.LN2 * ageMs) / halfLifeMs);
    return entry.importance * decayFactor;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function generateMemoryId(): MemoryId {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

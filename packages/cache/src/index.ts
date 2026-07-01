/**
 * @dream-xi/cache — 轻量级内存缓存
 *
 * 为 Dream XI AI 提供带 TTL 过期和 LRU 淘汰的类型安全缓存。
 * 零外部依赖，适合缓存 LLM 响应、战术配置、球员信息等。
 *
 * 核心能力：
 *   - TTL（Time To Live）：每个 key 可设置独立过期时间
 *   - LRU（Least Recently Used）：容量满时淘汰最久未访问的 key
 *   - 泛型支持：`Cache<V>` 类型安全，避免 any
 *   - `getOrSet(key, loader, ttl)`：缓存穿透保护的原子操作
 *   - 统计信息：命中率、miss 次数、当前 size
 *   - 事件回调：onEvict / onExpire / onSet / onGet
 *
 * @example
 * ```ts
 * import { Cache } from "@dream-xi/cache";
 *
 * const tacticCache = new Cache<TacticDefinition>({ maxSize: 100, defaultTtlMs: 5 * 60 * 1000 });
 *
 * // 带加载器的原子操作（SWR 风格）
 * const tactic = await tacticCache.getOrSet(
 *   "tdd-guardian",
 *   () => loadTacticFromDisk("tdd-guardian"),
 *   10 * 60 * 1000, // 10 分钟 TTL
 * );
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 缓存条目
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<V> {
  value: V;
  /** 过期时间（Unix 毫秒）。null 表示永不过期。 */
  expiresAt: number | null;
  /** 最近访问时间（用于 LRU 排序） */
  lastAccessedAt: number;
  /** 创建时间 */
  createdAt: number;
  /** 被访问次数 */
  hits: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 缓存配置
// ─────────────────────────────────────────────────────────────────────────────

/** 缓存事件回调 */
export interface CacheCallbacks<V> {
  /** key 被 LRU 淘汰时触发 */
  onEvict?: (key: string, value: V) => void;
  /** key 因 TTL 过期被删除时触发 */
  onExpire?: (key: string, value: V) => void;
  /** key 被写入时触发 */
  onSet?: (key: string, value: V, ttlMs: number | null) => void;
  /** key 被读取命中时触发 */
  onGet?: (key: string, value: V) => void;
}

/** `Cache` 构造选项 */
export interface CacheOptions<V> {
  /**
   * 最大缓存条目数。超过时按 LRU 策略淘汰。
   * @default 1000
   */
  maxSize?: number;
  /**
   * 默认 TTL（毫秒）。不传或传 null 表示永不过期。
   * @default null
   */
  defaultTtlMs?: number | null;
  /**
   * 过期清理检查间隔（毫秒）。
   * @default 60_000
   */
  cleanupIntervalMs?: number;
  /** 事件回调 */
  callbacks?: CacheCallbacks<V>;
}

/** 缓存统计信息 */
export interface CacheStats {
  /** 当前缓存条目数 */
  size: number;
  /** 最大容量 */
  maxSize: number;
  /** 总命中次数 */
  hits: number;
  /** 总未命中次数 */
  misses: number;
  /** 命中率（0-1） */
  hitRate: number;
  /** 因 TTL 过期被删除的总次数 */
  evictedByTtl: number;
  /** 因 LRU 被淘汰的总次数 */
  evictedByLru: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache 实现
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 类型安全的内存缓存。
 *
 * @template V 缓存值类型
 */
export class Cache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number | null;
  private readonly callbacks: CacheCallbacks<V>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // 统计
  private _hits = 0;
  private _misses = 0;
  private _evictedByTtl = 0;
  private _evictedByLru = 0;

  constructor(options: CacheOptions<V> = {}) {
    this.maxSize      = options.maxSize      ?? 1000;
    this.defaultTtlMs = options.defaultTtlMs ?? null;
    this.callbacks    = options.callbacks    ?? {};

    const cleanupMs = options.cleanupIntervalMs ?? 60_000;
    this.cleanupTimer = setInterval(() => this._sweepExpired(), cleanupMs);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  // ── get ───────────────────────────────────────────────────────────────────

  /**
   * 读取缓存值。
   * @returns 缓存值，若不存在或已过期则返回 `undefined`
   */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) {
      this._misses++;
      return undefined;
    }

    // 检查是否过期
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._evictExpired(key, entry);
      this._misses++;
      return undefined;
    }

    entry.lastAccessedAt = Date.now();
    entry.hits++;
    this._hits++;
    this.callbacks.onGet?.(key, entry.value);
    return entry.value;
  }

  // ── set ───────────────────────────────────────────────────────────────────

  /**
   * 写入缓存值。
   * @param key 缓存 key
   * @param value 缓存值
   * @param ttlMs TTL（毫秒）。不传则使用 `defaultTtlMs`。传 null 表示永不过期。
   */
  set(key: string, value: V, ttlMs?: number | null): void {
    // 如果 key 已存在，更新值
    if (this.store.has(key)) {
      const existing = this.store.get(key)!;
      const resolvedTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
      existing.value        = value;
      existing.expiresAt    = resolvedTtl !== null ? Date.now() + resolvedTtl : null;
      existing.lastAccessedAt = Date.now();
      this.callbacks.onSet?.(key, value, resolvedTtl);
      return;
    }

    // 容量检查：LRU 淘汰
    if (this.store.size >= this.maxSize) {
      this._evictLru();
    }

    const resolvedTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt:      resolvedTtl !== null ? now + resolvedTtl : null,
      lastAccessedAt: now,
      createdAt:      now,
      hits:           0,
    });
    this.callbacks.onSet?.(key, value, resolvedTtl);
  }

  // ── getOrSet ──────────────────────────────────────────────────────────────

  /**
   * 读取缓存，未命中时调用 `loader` 加载并写入缓存。
   * 线程安全（单进程内）：同一 key 同时只有一个 loader 在执行。
   *
   * @example
   * ```ts
   * const player = await cache.getOrSet(
   *   `player:${id}`,
   *   () => db.findPlayer(id),
   *   5 * 60 * 1000,
   * );
   * ```
   */
  async getOrSet(
    key: string,
    loader: () => V | Promise<V>,
    ttlMs?: number | null,
  ): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }

  // ── has ───────────────────────────────────────────────────────────────────

  /** 检查 key 是否存在且未过期（不更新 LRU 顺序） */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (entry === undefined) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._evictExpired(key, entry);
      return false;
    }
    return true;
  }

  // ── delete ────────────────────────────────────────────────────────────────

  /** 主动删除一个 key */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  // ── clear ─────────────────────────────────────────────────────────────────

  /** 清空所有缓存 */
  clear(): void {
    this.store.clear();
  }

  // ── keys / values / entries ───────────────────────────────────────────────

  /** 返回所有未过期的 key 列表 */
  keys(): string[] {
    const now = Date.now();
    return Array.from(this.store.entries())
      .filter(([, e]) => e.expiresAt === null || e.expiresAt > now)
      .map(([k]) => k);
  }

  /** 当前缓存条目总数（含已过期但未清理的） */
  get size(): number {
    return this.store.size;
  }

  // ── stats ─────────────────────────────────────────────────────────────────

  /** 获取缓存统计信息 */
  stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      size:          this.store.size,
      maxSize:       this.maxSize,
      hits:          this._hits,
      misses:        this._misses,
      hitRate:       total === 0 ? 0 : this._hits / total,
      evictedByTtl:  this._evictedByTtl,
      evictedByLru:  this._evictedByLru,
    };
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  /** 停止清理定时器，释放资源（测试清理用） */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  private _evictExpired(key: string, entry: CacheEntry<V>): void {
    this.store.delete(key);
    this._evictedByTtl++;
    this.callbacks.onExpire?.(key, entry.value);
  }

  private _evictLru(): void {
    // 找到最久未访问的 key
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey  = key;
      }
    }
    if (oldestKey !== "") {
      const entry = this.store.get(oldestKey)!;
      this.store.delete(oldestKey);
      this._evictedByLru++;
      this.callbacks.onEvict?.(oldestKey, entry.value);
    }
  }

  private _sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this._evictExpired(key, entry);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建缓存实例的工厂函数。
 *
 * @example
 * ```ts
 * const cache = createCache<string>({ maxSize: 500, defaultTtlMs: 60_000 });
 * ```
 */
export function createCache<V>(options?: CacheOptions<V>): Cache<V> {
  return new Cache<V>(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream XI 预设缓存实例
// ─────────────────────────────────────────────────────────────────────────────

/** 战术配置缓存（最多 200 条，10 分钟 TTL） */
export const tacticCache = createCache<unknown>({
  maxSize:      200,
  defaultTtlMs: 10 * 60 * 1000,
});

/** 球员信息缓存（最多 50 条，30 分钟 TTL） */
export const playerCache = createCache<unknown>({
  maxSize:      50,
  defaultTtlMs: 30 * 60 * 1000,
});

/** LLM 响应缓存（最多 1000 条，5 分钟 TTL，用于相同 prompt 去重） */
export const llmResponseCache = createCache<string>({
  maxSize:      1000,
  defaultTtlMs: 5 * 60 * 1000,
});

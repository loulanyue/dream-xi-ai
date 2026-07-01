/**
 * @dream-xi/rate-limiter — API 速率限制器
 *
 * 为 Dream XI AI HTTP 服务提供两种速率限制算法：
 *   - Token Bucket（令牌桶）：允许突发流量，适合 LLM 调用
 *   - Sliding Window（滑动窗口）：精确控制时间窗内请求数，适合 REST API
 *
 * 设计原则：
 *   - 零依赖，纯 In-Memory（适合单进程；多进程需替换后端为 Redis）
 *   - 按 key 隔离（如 IP、用户ID、球员ID）
 *   - 过期清理：自动回收长期不活跃的 key，防止内存泄漏
 *   - 标准 HTTP 头：生成 RateLimit-* 响应头
 *
 * @example
 * ```ts
 * import { TokenBucketLimiter, SlidingWindowLimiter } from "@dream-xi/rate-limiter";
 *
 * // 令牌桶：每分钟 60 个请求，桶最大容量 10
 * const limiter = new TokenBucketLimiter({ tokensPerSecond: 1, bucketSize: 10 });
 * const result = limiter.consume("coach");
 * if (!result.allowed) {
 *   res.writeHead(429, { "Retry-After": String(result.retryAfterMs / 1000) });
 *   return;
 * }
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────────────────────────────────────

/** 速率限制检查结果 */
export interface RateLimitResult {
  /** 是否允许本次请求 */
  allowed: boolean;
  /** 剩余可用令牌/请求数 */
  remaining: number;
  /** 当前限制值（窗口大小或桶容量） */
  limit: number;
  /** 重置时间（Unix 时间戳，毫秒） */
  resetAt: number;
  /** 建议重试的等待时间（毫秒），allowed 时为 0 */
  retryAfterMs: number;
}

/** 标准 HTTP Rate Limit 响应头 */
export interface RateLimitHeaders {
  "RateLimit-Limit": string;
  "RateLimit-Remaining": string;
  "RateLimit-Reset": string;
  "Retry-After"?: string;
}

/**
 * 将 RateLimitResult 转换为标准 HTTP 响应头。
 *
 * @example
 * ```ts
 * const headers = toRateLimitHeaders(result);
 * res.writeHead(429, headers);
 * ```
 */
export function toRateLimitHeaders(result: RateLimitResult): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    "RateLimit-Limit":     String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset":     String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.allowed && result.retryAfterMs > 0) {
    headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
// 令牌桶（Token Bucket）
// ─────────────────────────────────────────────────────────────────────────────

/** 令牌桶配置 */
export interface TokenBucketOptions {
  /**
   * 每秒补充的令牌数。
   * 例：tokensPerSecond=1 表示每秒允许 1 个请求。
   */
  tokensPerSecond: number;
  /**
   * 桶的最大容量（允许的突发请求数）。
   * @default tokensPerSecond * 10
   */
  bucketSize?: number;
  /**
   * 不活跃 key 的清理间隔（毫秒）。
   * @default 300_000 (5 分钟)
   */
  cleanupIntervalMs?: number;
}

interface BucketState {
  tokens: number;
  lastRefillAt: number;
}

/**
 * 令牌桶速率限制器。
 *
 * 适合：LLM 调用、流式请求等需要允许短时突发的场景。
 *
 * @example
 * ```ts
 * // 每秒最多 2 个请求，最多突发 5 个
 * const limiter = new TokenBucketLimiter({ tokensPerSecond: 2, bucketSize: 5 });
 * const result = limiter.consume("user:coach");
 * ```
 */
export class TokenBucketLimiter {
  private readonly tokensPerMs: number;
  private readonly bucketSize: number;
  private readonly buckets = new Map<string, BucketState>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: TokenBucketOptions) {
    this.tokensPerMs = options.tokensPerSecond / 1000;
    this.bucketSize  = options.bucketSize ?? options.tokensPerSecond * 10;

    const cleanupMs = options.cleanupIntervalMs ?? 300_000;
    this.cleanupTimer = setInterval(() => this._cleanup(), cleanupMs);
    // 允许 Node.js 进程在只剩此 timer 时退出
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 消耗 1 个令牌（1 次请求）。
   * @param key 限制维度（如 IP、userId）
   * @param cost 消耗令牌数（默认 1）
   */
  consume(key: string, cost = 1): RateLimitResult {
    const now = Date.now();
    let state = this.buckets.get(key);

    if (state === undefined) {
      state = { tokens: this.bucketSize, lastRefillAt: now };
      this.buckets.set(key, state);
    }

    // 补充令牌
    const elapsed = now - state.lastRefillAt;
    const refill   = elapsed * this.tokensPerMs;
    state.tokens    = Math.min(this.bucketSize, state.tokens + refill);
    state.lastRefillAt = now;

    if (state.tokens >= cost) {
      state.tokens -= cost;
      const resetAt = now + Math.ceil((this.bucketSize - state.tokens) / this.tokensPerMs);
      return {
        allowed:      true,
        remaining:    Math.floor(state.tokens),
        limit:        this.bucketSize,
        resetAt,
        retryAfterMs: 0,
      };
    }

    // 令牌不足
    const msUntilEnough = Math.ceil((cost - state.tokens) / this.tokensPerMs);
    return {
      allowed:      false,
      remaining:    0,
      limit:        this.bucketSize,
      resetAt:      now + msUntilEnough,
      retryAfterMs: msUntilEnough,
    };
  }

  /** 重置指定 key 的桶（测试或手动解封用） */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** 当前追踪的 key 数量 */
  get size(): number {
    return this.buckets.size;
  }

  /** 停止清理定时器（测试清理用） */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private _cleanup(): void {
    const now = Date.now();
    // 超过 10 分钟没有活动的 key 清理掉
    const threshold = 10 * 60 * 1000;
    for (const [key, state] of this.buckets) {
      if (now - state.lastRefillAt > threshold) {
        this.buckets.delete(key);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 滑动窗口（Sliding Window）
// ─────────────────────────────────────────────────────────────────────────────

/** 滑动窗口配置 */
export interface SlidingWindowOptions {
  /**
   * 时间窗口大小（毫秒）。
   * 例：windowMs=60_000 表示每分钟。
   */
  windowMs: number;
  /**
   * 窗口内允许的最大请求数。
   */
  maxRequests: number;
  /**
   * 不活跃 key 的清理间隔（毫秒）。
   * @default windowMs * 2
   */
  cleanupIntervalMs?: number;
}

interface WindowState {
  /** 请求时间戳列表（毫秒） */
  timestamps: number[];
}

/**
 * 滑动窗口速率限制器。
 *
 * 精确控制任意时间窗内的请求数。
 * 适合：REST API 端点、聊天消息频率控制。
 *
 * @example
 * ```ts
 * // 每分钟最多 30 条消息
 * const limiter = new SlidingWindowLimiter({ windowMs: 60_000, maxRequests: 30 });
 * const result = limiter.check("coach");
 * if (!result.allowed) {
 *   sendError(res, 429, "RATE_LIMITED", "请求过于频繁");
 * }
 * ```
 */
export class SlidingWindowLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly windows = new Map<string, WindowState>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SlidingWindowOptions) {
    this.windowMs    = options.windowMs;
    this.maxRequests = options.maxRequests;

    const cleanupMs = options.cleanupIntervalMs ?? options.windowMs * 2;
    this.cleanupTimer = setInterval(() => this._cleanup(), cleanupMs);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 检查并记录一次请求。
   * @param key 限制维度
   */
  check(key: string): RateLimitResult {
    const now        = Date.now();
    const windowStart = now - this.windowMs;

    let state = this.windows.get(key);
    if (state === undefined) {
      state = { timestamps: [] };
      this.windows.set(key, state);
    }

    // 移除窗口外的旧时间戳
    state.timestamps = state.timestamps.filter((t) => t > windowStart);

    const count = state.timestamps.length;
    const resetAt = state.timestamps.length > 0
      ? state.timestamps[0]! + this.windowMs
      : now + this.windowMs;

    if (count < this.maxRequests) {
      state.timestamps.push(now);
      return {
        allowed:      true,
        remaining:    this.maxRequests - count - 1,
        limit:        this.maxRequests,
        resetAt,
        retryAfterMs: 0,
      };
    }

    return {
      allowed:      false,
      remaining:    0,
      limit:        this.maxRequests,
      resetAt,
      retryAfterMs: Math.max(0, resetAt - now),
    };
  }

  /** 重置指定 key */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** 当前追踪的 key 数量 */
  get size(): number {
    return this.windows.size;
  }

  /** 停止清理定时器 */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private _cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, state] of this.windows) {
      // 全部时间戳都已过期则删除
      if (state.timestamps.every((t) => t <= windowStart)) {
        this.windows.delete(key);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream XI 预设限制器
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/chat 速率限制（每用户每分钟 20 次）
 */
export const chatRateLimiter = new SlidingWindowLimiter({
  windowMs:    60_000,
  maxRequests: 20,
});

/**
 * POST /api/chat LLM 令牌桶（每秒 1 次，允许突发 3 次）
 * 用于保护 LLM 调用不被单个用户打爆。
 */
export const llmTokenBucket = new TokenBucketLimiter({
  tokensPerSecond: 1,
  bucketSize:      3,
});

/**
 * GET /health 健康检查限制（每 IP 每分钟 60 次）
 */
export const healthRateLimiter = new SlidingWindowLimiter({
  windowMs:    60_000,
  maxRequests: 60,
});

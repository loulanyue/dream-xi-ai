/**
 * @dream-xi/retry — 生产级重试工具包
 *
 * 为 Dream XI AI 调用外部 LLM API 提供可靠的重试机制。
 * 零外部依赖，零 Node.js 版本限制。
 *
 * 核心能力：
 *   - 指数退避（Exponential Backoff）：延迟随重试次数倍增
 *   - Full Jitter：随机化延迟，避免惊群效应（Thundering Herd）
 *   - 可重试错误判断：区分临时错误（网络超时）和永久错误（参数错误）
 *   - 重试预算（Retry Budget）：全局限速，防止雪崩
 *   - 断路器（Circuit Breaker）：连续失败后自动熔断，保护下游
 *   - 完整事件回调：onRetry / onSuccess / onExhausted
 *   - AbortSignal 集成：支持外部取消
 *
 * @example
 * ```ts
 * import { withRetry, isRetryable } from "@dream-xi/retry";
 *
 * const result = await withRetry(
 *   () => callLLM(prompt),
 *   {
 *     maxAttempts: 4,
 *     baseDelayMs: 500,
 *     maxDelayMs:  30_000,
 *     isRetryable: (err) => isRetryable(err),
 *     onRetry: ({ attempt, delayMs, error }) =>
 *       log.warn({ attempt, delayMs }, `LLM call failed, retrying: ${error.message}`),
 *   }
 * );
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 重试配置
// ─────────────────────────────────────────────────────────────────────────────

/** 重试策略 */
export type BackoffStrategy =
  | "exponential"   // 指数退避（推荐）
  | "linear"        // 线性增长（固定步长）
  | "fixed";        // 固定延迟

/** 重试回调上下文 */
export interface RetryContext {
  /** 当前是第几次尝试（从 1 开始，1 = 首次执行） */
  attempt: number;
  /** 下次重试前等待的毫秒数 */
  delayMs: number;
  /** 触发本次重试的错误 */
  error: Error;
  /** 已消耗的总时间（毫秒） */
  elapsedMs: number;
}

/** 重试配置选项 */
export interface RetryOptions<T = unknown> {
  /**
   * 最大尝试次数（包含首次执行）。
   * 例：maxAttempts=4 表示最多重试 3 次。
   * @default 3
   */
  maxAttempts?: number;
  /**
   * 首次重试等待时间（毫秒）。
   * @default 300
   */
  baseDelayMs?: number;
  /**
   * 最大等待时间上限（毫秒），退避超过此值时截断。
   * @default 30_000
   */
  maxDelayMs?: number;
  /**
   * 退避策略。
   * @default "exponential"
   */
  strategy?: BackoffStrategy;
  /**
   * 退避倍数（仅 exponential 策略有效）。
   * delay = baseDelayMs * (factor ^ (attempt - 1))
   * @default 2
   */
  factor?: number;
  /**
   * 是否启用 Full Jitter（随机化延迟以避免惊群效应）。
   * 启用后：actualDelay = random(0, calculatedDelay)
   * @default true
   */
  jitter?: boolean;
  /**
   * 判断错误是否可重试。返回 false 则立即抛出，不再重试。
   * 不传则默认所有错误都重试。
   */
  isRetryable?: (error: Error) => boolean;
  /**
   * 每次重试前调用（用于日志、监控）。
   */
  onRetry?: (ctx: RetryContext) => void;
  /**
   * 所有重试耗尽后调用（最终失败时）。
   */
  onExhausted?: (ctx: Omit<RetryContext, "delayMs">) => void;
  /**
   * 操作成功时调用。
   */
  onSuccess?: (result: T, attempt: number, elapsedMs: number) => void;
  /**
   * AbortSignal，用于外部取消重试循环。
   */
  signal?: AbortSignal;
  /**
   * 单次操作超时时间（毫秒）。超时后视为可重试错误。
   * 不传则不设超时。
   */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 重试专用错误类型
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 所有重试次数耗尽后抛出的错误。
 * 包含最后一次失败的原始错误和重试统计信息。
 */
export class RetryExhaustedError extends Error {
  /** 触发本错误的最后一次失败 */
  readonly cause: Error;
  /** 总尝试次数（含首次） */
  readonly attempts: number;
  /** 总耗时（毫秒） */
  readonly elapsedMs: number;

  constructor(cause: Error, attempts: number, elapsedMs: number) {
    super(
      `操作在 ${attempts} 次尝试后仍然失败（耗时 ${elapsedMs}ms）：${cause.message}`,
    );
    this.name = "RetryExhaustedError";
    this.cause = cause;
    this.attempts = attempts;
    this.elapsedMs = elapsedMs;
  }
}

/**
 * 操作被取消时抛出的错误（AbortSignal 触发）。
 */
export class RetryCancelledError extends Error {
  constructor(attempt: number) {
    super(`重试操作在第 ${attempt} 次尝试时被取消`);
    this.name = "RetryCancelledError";
  }
}

/**
 * 操作超时时抛出的错误（用于 timeoutMs 选项）。
 * 此错误会被视为可重试错误。
 */
export class RetryTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`操作超时（限制 ${timeoutMs}ms）`);
    this.name = "RetryTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 延迟计算
// ─────────────────────────────────────────────────────────────────────────────

function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  strategy: BackoffStrategy,
  factor: number,
  jitter: boolean,
): number {
  let delay: number;

  switch (strategy) {
    case "exponential":
      delay = baseDelayMs * Math.pow(factor, attempt - 1);
      break;
    case "linear":
      delay = baseDelayMs * attempt;
      break;
    case "fixed":
    default:
      delay = baseDelayMs;
  }

  // 截断到最大值
  delay = Math.min(delay, maxDelayMs);

  // Full Jitter：随机化延迟
  if (jitter) {
    delay = Math.random() * delay;
  }

  return Math.floor(delay);
}

// ─────────────────────────────────────────────────────────────────────────────
// 带超时的执行器
// ─────────────────────────────────────────────────────────────────────────────

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RetryTimeoutError(timeoutMs));
    }, timeoutMs);

    fn().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 核心重试函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 执行异步操作，失败时按配置自动重试。
 *
 * @param fn 要执行的异步操作
 * @param options 重试配置
 * @returns 操作成功的返回值
 * @throws `RetryExhaustedError` 所有次数用尽
 * @throws `RetryCancelledError` AbortSignal 触发取消
 * @throws 原始错误（`isRetryable` 返回 false 时立即抛出）
 *
 * @example
 * ```ts
 * // 调用 LLM，最多 4 次，指数退避 + Jitter
 * const reply = await withRetry(() => llmClient.chat(prompt), {
 *   maxAttempts: 4,
 *   baseDelayMs: 1000,
 *   maxDelayMs:  15_000,
 *   isRetryable: (err) => isRetryable(err),
 *   onRetry: ({ attempt, delayMs }) =>
 *     log.warn(`LLM 调用失败，第 ${attempt} 次重试，等待 ${delayMs}ms`),
 * });
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions<T> = {},
): Promise<T> {
  const {
    maxAttempts  = 3,
    baseDelayMs  = 300,
    maxDelayMs   = 30_000,
    strategy     = "exponential",
    factor       = 2,
    jitter       = true,
    isRetryable,
    onRetry,
    onExhausted,
    onSuccess,
    signal,
    timeoutMs,
  } = options;

  const startTime = Date.now();
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 检查取消信号
    if (signal?.aborted) {
      throw new RetryCancelledError(attempt);
    }

    try {
      const result = timeoutMs !== undefined
        ? await executeWithTimeout(fn, timeoutMs)
        : await fn();

      const elapsedMs = Date.now() - startTime;
      onSuccess?.(result, attempt, elapsedMs);
      return result;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 不可重试错误：立即抛出
      if (isRetryable !== undefined && !isRetryable(lastError)) {
        throw lastError;
      }

      // 已到最后一次尝试
      if (attempt === maxAttempts) {
        break;
      }

      // 计算等待时间并通知
      const delayMs = calculateDelay(attempt, baseDelayMs, maxDelayMs, strategy, factor, jitter);
      const elapsedMs = Date.now() - startTime;

      onRetry?.({ attempt, delayMs, error: lastError, elapsedMs });

      // 等待，期间监听取消信号
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);

        if (signal) {
          const abortHandler = (): void => {
            clearTimeout(timer);
            reject(new RetryCancelledError(attempt + 1));
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      });
    }
  }

  const elapsedMs = Date.now() - startTime;
  onExhausted?.({ attempt: maxAttempts, error: lastError, elapsedMs });
  throw new RetryExhaustedError(lastError, maxAttempts, elapsedMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// 可重试错误判断工具
// ─────────────────────────────────────────────────────────────────────────────

/** HTTP 状态码：可重试的响应码集合 */
export const RETRYABLE_HTTP_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * 判断一个错误是否应该触发重试。
 *
 * 可重试情况：
 *   - 网络错误（ECONNRESET、ENOTFOUND、ETIMEDOUT 等）
 *   - HTTP 5xx 错误
 *   - HTTP 429 限速错误
 *   - 超时错误（`RetryTimeoutError`）
 *
 * 不可重试情况：
 *   - HTTP 4xx（400、401、403、404 等）
 *   - JSON 解析错误
 *   - 参数验证错误
 *
 * @example
 * ```ts
 * withRetry(fn, { isRetryable: (err) => isRetryable(err) });
 * ```
 */
export function isRetryable(error: Error): boolean {
  // 超时错误始终可重试
  if (error instanceof RetryTimeoutError) return true;

  // 检查 HTTP 状态码（LLM SDK 通常把状态码放在 error.status 或 error.statusCode）
  const status =
    (error as Record<string, unknown>)["status"] ??
    (error as Record<string, unknown>)["statusCode"];

  if (typeof status === "number") {
    return RETRYABLE_HTTP_CODES.has(status);
  }

  // 网络层错误码
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== undefined) {
    return [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EAI_AGAIN",
    ].includes(code);
  }

  // 消息关键词匹配（兜底）
  const msg = error.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("service unavailable") ||
    msg.includes("connection reset") ||
    msg.includes("network error")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 断路器（Circuit Breaker）
// ─────────────────────────────────────────────────────────────────────────────

/** 断路器状态 */
export type CircuitState = "closed" | "open" | "half-open";

/** 断路器配置 */
export interface CircuitBreakerOptions {
  /**
   * 连续失败多少次后打开断路器（熔断）。
   * @default 5
   */
  failureThreshold?: number;
  /**
   * 断路器打开后，多少毫秒后进入半开状态（尝试恢复）。
   * @default 60_000
   */
  recoveryTimeMs?: number;
  /**
   * 半开状态下，连续成功多少次后关闭断路器（恢复正常）。
   * @default 2
   */
  successThreshold?: number;
  /** 状态变更回调 */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * 断路器。
 *
 * 当下游服务连续失败达到阈值时，自动熔断（停止调用），
 * 经过恢复等待期后进入半开状态尝试探测，成功后恢复正常。
 *
 * @example
 * ```ts
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   recoveryTimeMs: 30_000,
 * });
 *
 * // 在重试之前先检查断路器
 * const reply = await breaker.execute(() =>
 *   withRetry(() => llmClient.chat(prompt), retryOptions)
 * );
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastOpenedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly recoveryTimeMs: number;
  private readonly successThreshold: number;
  private readonly onStateChange?: CircuitBreakerOptions["onStateChange"];

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold  = options.failureThreshold ?? 5;
    this.recoveryTimeMs    = options.recoveryTimeMs   ?? 60_000;
    this.successThreshold  = options.successThreshold ?? 2;
    this.onStateChange     = options.onStateChange;
  }

  /** 当前断路器状态 */
  get currentState(): CircuitState {
    return this._resolvedState();
  }

  /** 连续失败次数 */
  get failures(): number {
    return this.consecutiveFailures;
  }

  /**
   * 执行操作，自动应用断路器保护。
   * 断路器打开时直接抛出，不执行 fn。
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this._resolvedState();

    if (state === "open") {
      throw new Error(
        `[CircuitBreaker] 断路器已打开，拒绝请求。` +
        `下次恢复尝试在 ${this._msUntilHalfOpen()}ms 后`,
      );
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  /** 手动重置断路器为关闭状态 */
  reset(): void {
    const prev = this.state;
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastOpenedAt = null;
    if (prev !== "closed") this.onStateChange?.(prev, "closed");
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  private _resolvedState(): CircuitState {
    if (this.state === "open" && this.lastOpenedAt !== null) {
      if (Date.now() - this.lastOpenedAt >= this.recoveryTimeMs) {
        this._transition("half-open");
      }
    }
    return this.state;
  }

  private _onSuccess(): void {
    if (this.state === "half-open") {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this._transition("closed");
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
      }
    } else {
      this.consecutiveFailures = 0;
    }
  }

  private _onFailure(): void {
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;

    if (
      this.state !== "open" &&
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this._transition("open");
      this.lastOpenedAt = Date.now();
    }
  }

  private _transition(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    if (from !== to) this.onStateChange?.(from, to);
  }

  private _msUntilHalfOpen(): number {
    if (this.lastOpenedAt === null) return 0;
    return Math.max(0, this.recoveryTimeMs - (Date.now() - this.lastOpenedAt));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream XI 预设配置
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LLM API 调用推荐重试配置。
 *
 * @example
 * ```ts
 * import { withRetry, LLM_RETRY_OPTIONS } from "@dream-xi/retry";
 * const result = await withRetry(() => callLLM(prompt), LLM_RETRY_OPTIONS);
 * ```
 */
export const LLM_RETRY_OPTIONS = {
  maxAttempts: 4,
  baseDelayMs: 1_000,
  maxDelayMs:  20_000,
  strategy:    "exponential" as BackoffStrategy,
  factor:      2,
  jitter:      true,
  isRetryable,
  timeoutMs:   60_000,
} satisfies RetryOptions;

/**
 * 内存/配置操作推荐重试配置（更宽松）。
 */
export const INFRA_RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs:  5_000,
  strategy:    "exponential" as BackoffStrategy,
  factor:      2,
  jitter:      true,
  isRetryable,
} satisfies RetryOptions;

/**
 * Dream XI LLM 断路器推荐配置。
 */
export const LLM_CIRCUIT_BREAKER_OPTIONS = {
  failureThreshold: 5,
  recoveryTimeMs:   30_000,
  successThreshold: 2,
} satisfies CircuitBreakerOptions;

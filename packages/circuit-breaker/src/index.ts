/**
 * @dream-xi/circuit-breaker — LLM API 熔断器
 *
 * 为 Dream XI AI 球员提供熔断器（Circuit Breaker）弹性容错模式：
 * - 三态状态机：CLOSED（正常）→ OPEN（熔断）→ HALF_OPEN（探针恢复）
 * - 可配置失败阈值、熔断持续时间与探针成功阈值
 * - 事件监听（状态变更、调用成功/失败/拒绝）
 * - 运行时统计快照
 *
 * @example
 * ```ts
 * const breaker = new CircuitBreaker("openai-chat", {
 *   failureThreshold:    5,     // 5 次失败后熔断
 *   recoveryTimeMs:  30_000,    // 30 秒后进入 HALF_OPEN 探针
 *   probeSuccessThreshold: 2,   // 连续 2 次成功后关闭熔断
 * });
 *
 * // 用熔断器包裹 LLM 调用
 * const reply = await breaker.execute(() => callOpenAI(prompt));
 *
 * // 监听状态变更
 * breaker.on("stateChange", ({ from, to }) => {
 *   logger.warn(`熔断器 ${breaker.name}: ${from} → ${to}`);
 * });
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 熔断器状态 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** 熔断器配置 */
export interface CircuitBreakerOptions {
  /**
   * 连续失败多少次后触发熔断（进入 OPEN 状态）
   * @default 5
   */
  failureThreshold?: number;
  /**
   * OPEN 状态持续时间（毫秒），超过后自动进入 HALF_OPEN
   * @default 30000
   */
  recoveryTimeMs?: number;
  /**
   * HALF_OPEN 状态下，连续成功多少次后关闭熔断（进入 CLOSED）
   * @default 2
   */
  probeSuccessThreshold?: number;
  /**
   * 可选：判断一个错误是否计入失败次数的函数
   * 返回 false 则不计入（如 404 Not Found 不触发熔断）
   * @default () => true
   */
  isFailure?: (error: unknown) => boolean;
}

/** 状态变更事件 */
export interface StateChangeEvent {
  from: CircuitState;
  to: CircuitState;
  timestamp: number;
}

/** 熔断器统计快照 */
export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  rejectedCount: number;
  lastFailureAt: number | null;
  lastStateChangeAt: number;
  probeSuccessCount: number;
}

/** 熔断开路错误（OPEN 状态下调用直接抛出此错误，不执行 fn） */
export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — call rejected`);
    this.name = "CircuitOpenError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 事件发射器（轻量内部实现，无需继承 Node EventEmitter）
// ─────────────────────────────────────────────────────────────────────────────

type EventMap = {
  stateChange: StateChangeEvent;
  success: { durationMs: number };
  failure: { error: string; durationMs: number };
  rejected: Record<string, never>;
};

type EventHandler<T> = (payload: T) => void;

// ─────────────────────────────────────────────────────────────────────────────
// CircuitBreaker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 熔断器
 *
 * 状态机转换规则：
 * - **CLOSED**：正常调用，失败次数达到 `failureThreshold` → 进入 OPEN
 * - **OPEN**：所有调用立即拒绝（抛出 CircuitOpenError），
 *   等待 `recoveryTimeMs` 后自动进入 HALF_OPEN
 * - **HALF_OPEN**：放行探针调用，连续成功 `probeSuccessThreshold` 次 → 恢复 CLOSED；
 *   任意失败 → 重置回 OPEN
 */
export class CircuitBreaker {
  readonly name: string;

  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private rejectedCount = 0;
  private probeSuccessCount = 0;
  private lastFailureAt: number | null = null;
  private lastStateChangeAt: number = Date.now();
  private openedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly recoveryTimeMs: number;
  private readonly probeSuccessThreshold: number;
  private readonly isFailure: (error: unknown) => boolean;

  // 轻量事件监听
  private readonly listeners = new Map<string, EventHandler<unknown>[]>();

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeMs = options.recoveryTimeMs ?? 30_000;
    this.probeSuccessThreshold = options.probeSuccessThreshold ?? 2;
    this.isFailure = options.isFailure ?? (() => true);
  }

  // ─── 核心执行 ──────────────────────────────────────────────────────────────

  /**
   * 用熔断器包裹执行异步函数
   *
   * - CLOSED / HALF_OPEN：正常执行 fn
   * - OPEN 且未到恢复时间：抛出 CircuitOpenError
   * - OPEN 且已到恢复时间：自动切换到 HALF_OPEN 后执行 fn
   */
  async execute<T>(fn: () => T | Promise<T>): Promise<T> {
    // 检查是否到达恢复时间
    if (this.state === "OPEN") {
      if (this.openedAt !== null && Date.now() - this.openedAt >= this.recoveryTimeMs) {
        this.transitionTo("HALF_OPEN");
      } else {
        this.rejectedCount++;
        this.emit("rejected", {});
        throw new CircuitOpenError(this.name);
      }
    }

    const startedAt = Date.now();
    try {
      const result = await fn();
      this.onSuccess(Date.now() - startedAt);
      return result;
    } catch (err) {
      this.onFailure(err, Date.now() - startedAt);
      throw err;
    }
  }

  // ─── 状态查询 ──────────────────────────────────────────────────────────────

  /** 当前状态 */
  get currentState(): CircuitState {
    return this.state;
  }

  /** 是否可以调用（CLOSED 或 HALF_OPEN 或 OPEN 但已到恢复时间） */
  get isCallable(): boolean {
    if (this.state !== "OPEN") return true;
    return this.openedAt !== null && Date.now() - this.openedAt >= this.recoveryTimeMs;
  }

  /** 运行时统计快照 */
  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      rejectedCount: this.rejectedCount,
      lastFailureAt: this.lastFailureAt,
      lastStateChangeAt: this.lastStateChangeAt,
      probeSuccessCount: this.probeSuccessCount,
    };
  }

  /** 手动重置为 CLOSED 状态（紧急恢复用） */
  reset(): void {
    this.failureCount = 0;
    this.probeSuccessCount = 0;
    this.openedAt = null;
    this.transitionTo("CLOSED");
  }

  // ─── 事件监听 ──────────────────────────────────────────────────────────────

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): this {
    const list = this.listeners.get(event) ?? [];
    list.push(handler as EventHandler<unknown>);
    this.listeners.set(event, list);
    return this;
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): this {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((h) => h !== (handler as EventHandler<unknown>)),
    );
    return this;
  }

  // ─── 内部逻辑 ──────────────────────────────────────────────────────────────

  private onSuccess(durationMs: number): void {
    this.successCount++;
    this.emit("success", { durationMs });

    if (this.state === "HALF_OPEN") {
      this.probeSuccessCount++;
      if (this.probeSuccessCount >= this.probeSuccessThreshold) {
        this.failureCount = 0;
        this.probeSuccessCount = 0;
        this.openedAt = null;
        this.transitionTo("CLOSED");
      }
    } else if (this.state === "CLOSED") {
      // 成功时重置连续失败计数
      this.failureCount = 0;
    }
  }

  private onFailure(error: unknown, durationMs: number): void {
    if (!this.isFailure(error)) return; // 不计入熔断失败

    const errorMsg = error instanceof Error ? error.message : String(error);
    this.failureCount++;
    this.lastFailureAt = Date.now();
    this.emit("failure", { error: errorMsg, durationMs });

    if (this.state === "HALF_OPEN") {
      // HALF_OPEN 探针失败 → 重新进入 OPEN
      this.probeSuccessCount = 0;
      this.openedAt = Date.now();
      this.transitionTo("OPEN");
    } else if (this.state === "CLOSED" && this.failureCount >= this.failureThreshold) {
      this.openedAt = Date.now();
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(next: CircuitState): void {
    if (this.state === next) return;
    const event: StateChangeEvent = {
      from: this.state,
      to: next,
      timestamp: Date.now(),
    };
    this.state = next;
    this.lastStateChangeAt = event.timestamp;
    this.emit("stateChange", event);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(payload as unknown);
  }
}

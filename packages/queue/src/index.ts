/**
 * @dream-xi/queue — 进程内任务队列
 *
 * 为 Dream XI AI 提供轻量级、生产可用的任务调度能力：
 *
 *   - **并发控制**：最多同时执行 N 个任务，超出的进入等待队列
 *   - **优先级调度**：数字越大优先级越高，同优先级按入队顺序（FIFO）
 *   - **延迟执行**：`delayMs` 指定任务在多少毫秒后才允许被取出执行
 *   - **每任务重试**：独立 `maxRetries` + 指数退避，失败不影响其他任务
 *   - **AbortSignal**：可在等待/执行过程中取消单个任务
 *   - **事件回调**：`onStart / onSuccess / onFail / onDrain`，方便监控与日志
 *   - **零依赖**：纯 Node.js 内置 API
 *
 * 适合场景：
 *   - 批量 LLM API 调用（限制并发防止 rate limit）
 *   - 定时触发的战术评估任务
 *   - 球员分析报告批量生成
 *
 * @example
 * ```ts
 * import { TaskQueue } from "@dream-xi/queue";
 *
 * const queue = new TaskQueue({ concurrency: 3, defaultPriority: 0 });
 *
 * // 添加高优先级 LLM 任务
 * const result = await queue.add(
 *   () => callLlm("分析球员表现"),
 *   { priority: 10, maxRetries: 2, delayMs: 0 },
 * );
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 任务状态 */
export type TaskStatus =
  | "pending" // 等待中（含延迟等待）
  | "running" // 执行中
  | "done" // 成功完成
  | "failed" // 最终失败（重试耗尽）
  | "cancelled"; // 已取消（AbortSignal）

/** 添加任务的选项 */
export interface EnqueueOptions {
  /**
   * 任务优先级，数字越大越先执行。
   * @default 0
   */
  priority?: number;
  /**
   * 延迟多少毫秒后才允许执行。
   * @default 0
   */
  delayMs?: number;
  /**
   * 最大重试次数（不含首次执行）。
   * 首次失败后重试，最多重试 `maxRetries` 次。
   * @default 0
   */
  maxRetries?: number;
  /**
   * 重试基础等待时间（毫秒），指数退避：delay = baseRetryDelayMs * 2^attempt
   * @default 500
   */
  baseRetryDelayMs?: number;
  /**
   * 外部取消信号。触发 abort 时任务状态变为 cancelled。
   */
  signal?: AbortSignal;
  /**
   * 任务描述（用于日志/调试）
   */
  label?: string;
}

/** 任务执行结果（resolve 时返回） */
export interface TaskResult<T> {
  /** 任务返回值 */
  value: T;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 实际执行了几次（1 = 首次成功，2 = 重试一次后成功） */
  attempts: number;
}

/** 队列事件回调 */
export interface QueueCallbacks<T = unknown> {
  /** 任务开始执行 */
  onStart?: (taskId: string, label: string | undefined, attempt: number) => void;
  /** 任务成功完成 */
  onSuccess?: (taskId: string, result: TaskResult<T>, label: string | undefined) => void;
  /** 单次执行失败（含重试中的失败） */
  onFail?: (
    taskId: string,
    error: unknown,
    attempt: number,
    willRetry: boolean,
    label: string | undefined,
  ) => void;
  /** 队列变为空（所有任务完成或失败） */
  onDrain?: () => void;
}

/** `TaskQueue` 构造选项 */
export interface TaskQueueOptions<T = unknown> {
  /**
   * 最大并发数。
   * @default 5
   */
  concurrency?: number;
  /**
   * 全局默认优先级。
   * @default 0
   */
  defaultPriority?: number;
  /**
   * 全局默认最大重试次数。
   * @default 0
   */
  defaultMaxRetries?: number;
  /**
   * 事件回调
   */
  callbacks?: QueueCallbacks<T>;
}

/** 队列统计快照 */
export interface QueueStats {
  /** 当前等待队列长度 */
  pending: number;
  /** 正在执行的任务数 */
  running: number;
  /** 历史完成任务总数 */
  totalCompleted: number;
  /** 历史失败任务总数（重试耗尽） */
  totalFailed: number;
  /** 历史取消任务总数 */
  totalCancelled: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部任务节点
// ─────────────────────────────────────────────────────────────────────────────

interface TaskNode<T> {
  id: string;
  fn: () => T | Promise<T>;
  priority: number;
  /** 最早可执行时间（Unix ms），0 = 立即可执行 */
  availableAt: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  signal?: AbortSignal;
  label?: string;
  /** resolve / reject of the outer Promise returned to caller */
  resolve: (result: TaskResult<T>) => void;
  reject: (err: unknown) => void;
  status: TaskStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskQueue
// ─────────────────────────────────────────────────────────────────────────────

/** 自增 ID 生成器 */
let _idCounter = 0;
function nextId(): string {
  return `tq-${++_idCounter}`;
}

/** 指数退避等待 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * 进程内任务队列。
 *
 * @template T 队列中任务的返回值类型（所有任务共享一个 T，或使用 `unknown`）
 */
export class TaskQueue<T = unknown> {
  private readonly concurrency: number;
  private readonly defaultPriority: number;
  private readonly defaultMaxRetries: number;
  private readonly callbacks: QueueCallbacks<T>;

  /** 等待队列（优先级堆，简单数组 + 排序） */
  private readonly pending: TaskNode<T>[] = [];
  /** 当前正在运行的任务数 */
  private running = 0;

  /** 统计 */
  private totalCompleted = 0;
  private totalFailed = 0;
  private totalCancelled = 0;

  constructor(options: TaskQueueOptions<T> = {}) {
    this.concurrency = options.concurrency ?? 5;
    this.defaultPriority = options.defaultPriority ?? 0;
    this.defaultMaxRetries = options.defaultMaxRetries ?? 0;
    this.callbacks = options.callbacks ?? {};
  }

  // ── add ───────────────────────────────────────────────────────────────────

  /**
   * 将任务加入队列。
   * 返回一个 Promise，任务最终成功时 resolve `TaskResult<T>`，失败时 reject。
   *
   * @param fn 要执行的异步/同步函数
   * @param options 任务级别选项（覆盖队列默认值）
   */
  add(fn: () => T | Promise<T>, options: EnqueueOptions = {}): Promise<TaskResult<T>> {
    return new Promise<TaskResult<T>>((resolve, reject) => {
      const signal = options.signal;

      // 已经 aborted，直接拒绝
      if (signal?.aborted) {
        this.totalCancelled++;
        reject(new DOMException("Task cancelled before enqueue", "AbortError"));
        return;
      }

      const node: TaskNode<T> = {
        id: nextId(),
        fn,
        priority: options.priority ?? this.defaultPriority,
        availableAt: options.delayMs ? Date.now() + options.delayMs : 0,
        maxRetries: options.maxRetries ?? this.defaultMaxRetries,
        baseRetryDelayMs: options.baseRetryDelayMs ?? 500,
        resolve,
        reject,
        status: "pending",
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        ...(options.label !== undefined ? { label: options.label } : {}),
      };

      // AbortSignal 监听
      signal?.addEventListener(
        "abort",
        () => {
          const idx = this.pending.indexOf(node);
          if (idx !== -1) {
            this.pending.splice(idx, 1);
            node.status = "cancelled";
            this.totalCancelled++;
            reject(new DOMException("Task cancelled", "AbortError"));
          }
        },
        { once: true },
      );

      this._enqueue(node);
      this._tick();
    });
  }

  // ── pause / resume ────────────────────────────────────────────────────────

  private _paused = false;

  /** 暂停调度（不影响正在执行的任务） */
  pause(): void {
    this._paused = true;
  }

  /** 恢复调度 */
  resume(): void {
    this._paused = false;
    this._tick();
  }

  // ── stats ─────────────────────────────────────────────────────────────────

  /** 当前队列统计快照 */
  stats(): QueueStats {
    return {
      pending: this.pending.length,
      running: this.running,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      totalCancelled: this.totalCancelled,
    };
  }

  /** 等待队列是否为空且没有正在运行的任务 */
  get idle(): boolean {
    return this.pending.length === 0 && this.running === 0;
  }

  // ── clear ─────────────────────────────────────────────────────────────────

  /**
   * 清空等待队列（正在执行的任务继续运行）。
   * 所有被清除的任务 reject `QueueClearedError`。
   */
  clear(): void {
    const cancelled = this.pending.splice(0);
    for (const node of cancelled) {
      node.status = "cancelled";
      this.totalCancelled++;
      node.reject(new Error("Queue cleared"));
    }
  }

  // ── 内部调度 ──────────────────────────────────────────────────────────────

  private _enqueue(node: TaskNode<T>): void {
    this.pending.push(node);
    // 按优先级降序 + availableAt 升序排列（简单插入排序，队列通常不大）
    this.pending.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.availableAt - b.availableAt;
    });
  }

  private _tick(): void {
    if (this._paused) return;

    while (this.running < this.concurrency && this.pending.length > 0) {
      const now = Date.now();
      // 找到第一个 availableAt <= now 的任务
      const idx = this.pending.findIndex((n) => n.availableAt <= now);
      if (idx === -1) {
        // 所有任务都有延迟，设置定时器再触发
        const earliest = Math.min(...this.pending.map((n) => n.availableAt));
        setTimeout(() => this._tick(), earliest - now);
        break;
      }
      const node = this.pending.splice(idx, 1)[0];
      if (node) {
        this._execute(node);
      }
    }
  }

  private _execute(node: TaskNode<T>): void {
    if (node.signal?.aborted) {
      node.status = "cancelled";
      this.totalCancelled++;
      node.reject(new DOMException("Task cancelled", "AbortError"));
      this._tick();
      return;
    }

    this.running++;
    node.status = "running";
    this._runWithRetry(node, 0, Date.now());
  }

  private _runWithRetry(node: TaskNode<T>, attempt: number, startedAt: number): void {
    this.callbacks.onStart?.(node.id, node.label, attempt + 1);

    Promise.resolve()
      .then(() => node.fn())
      .then((value) => {
        node.status = "done";
        this.running--;
        this.totalCompleted++;

        const result: TaskResult<T> = {
          value,
          durationMs: Date.now() - startedAt,
          attempts: attempt + 1,
        };
        this.callbacks.onSuccess?.(node.id, result, node.label);
        node.resolve(result);

        this._afterTask();
      })
      .catch((err: unknown) => {
        const willRetry = attempt < node.maxRetries && !node.signal?.aborted;
        this.callbacks.onFail?.(node.id, err, attempt + 1, willRetry, node.label);

        if (willRetry) {
          const delay = node.baseRetryDelayMs * 2 ** attempt;
          sleep(delay, node.signal)
            .then(() => this._runWithRetry(node, attempt + 1, startedAt))
            .catch((abortErr: unknown) => {
              // AbortSignal 在重试等待期间触发
              node.status = "cancelled";
              this.running--;
              this.totalCancelled++;
              node.reject(abortErr);
              this._afterTask();
            });
        } else {
          node.status = node.signal?.aborted ? "cancelled" : "failed";
          this.running--;
          if (node.status === "cancelled") this.totalCancelled++;
          else this.totalFailed++;
          node.reject(err);
          this._afterTask();
        }
      });
  }

  private _afterTask(): void {
    this._tick();
    if (this.idle) {
      this.callbacks.onDrain?.();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建任务队列实例。
 *
 * @example
 * ```ts
 * const queue = createQueue<string>({ concurrency: 3 });
 * ```
 */
export function createQueue<T = unknown>(options?: TaskQueueOptions<T>): TaskQueue<T> {
  return new TaskQueue<T>(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream XI 预设队列
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LLM 调用队列（并发 3，默认重试 2 次）
 *
 * 统一管理所有 LLM API 调用，防止超出 rate limit。
 * 高优先级任务（如用户实时请求）可传 `priority: 10`，
 * 后台批量任务传 `priority: 0`（默认）。
 */
export const llmQueue = createQueue<unknown>({
  concurrency: 3,
  defaultMaxRetries: 2,
  callbacks: {
    onFail: (id, err, attempt, willRetry) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[llmQueue] task ${id} attempt ${attempt} failed: ${errMsg}${willRetry ? " (retrying)" : " (exhausted)"}`,
      );
    },
    onDrain: () => {
      console.debug("[llmQueue] all tasks completed");
    },
  },
});

/**
 * 后台分析队列（并发 1，串行执行，不重试）
 *
 * 用于报告生成、历史数据归档等非实时后台任务，严格串行避免资源争抢。
 */
export const analysisQueue = createQueue<unknown>({
  concurrency: 1,
  defaultMaxRetries: 0,
});

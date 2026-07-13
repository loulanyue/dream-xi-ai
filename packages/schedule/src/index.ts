/**
 * @dream-xi/schedule — Agent 任务调度器
 *
 * 为 Dream XI AI 球员提供轻量级任务调度能力：
 * - 固定间隔重复任务（interval job）
 * - 一次性延迟任务（one-shot timer）
 * - 命名任务注册与管理（Scheduler）
 * - 优雅关闭（停止所有任务）
 * - 任务执行历史与错误记录
 *
 * @example 重复间隔任务
 * ```ts
 * const scheduler = new Scheduler();
 *
 * scheduler.repeat("heartbeat", 30_000, async () => {
 *   await pingHealthEndpoint();
 * });
 *
 * // 60 秒后停止
 * setTimeout(() => scheduler.cancel("heartbeat"), 60_000);
 * ```
 *
 * @example 一次性延迟任务
 * ```ts
 * scheduler.delay("warm-up", 5_000, async () => {
 *   await preloadModels();
 * });
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 任务状态 */
export type TaskStatus = "idle" | "running" | "stopped" | "error";

/** 任务执行记录 */
export interface TaskRun {
  /** 执行序号（从 1 开始） */
  runIndex: number;
  /** 执行开始时间（毫秒时间戳） */
  startedAt: number;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 是否成功 */
  success: boolean;
  /** 失败时的错误信息 */
  error?: string;
}

/** 任务信息快照 */
export interface TaskInfo {
  /** 任务名称 */
  name: string;
  /** 任务类型 */
  type: "repeat" | "delay";
  /** 当前状态 */
  status: TaskStatus;
  /** 创建时间 */
  createdAt: number;
  /** 总执行次数 */
  totalRuns: number;
  /** 成功次数 */
  successRuns: number;
  /** 失败次数 */
  failedRuns: number;
  /** 最近 10 次执行记录 */
  recentRuns: TaskRun[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部任务条目
// ─────────────────────────────────────────────────────────────────────────────

interface TaskEntry {
  name: string;
  type: "repeat" | "delay";
  status: TaskStatus;
  createdAt: number;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  recentRuns: TaskRun[];
  timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 任务调度器
 *
 * 统一管理命名任务的注册、运行、取消和状态查询。
 */
export class Scheduler {
  private readonly tasks = new Map<string, TaskEntry>();

  // ─── 注册任务 ──────────────────────────────────────────────────────────────

  /**
   * 注册一个固定间隔重复执行的任务
   *
   * @param name 任务名称（同名任务会先取消旧任务）
   * @param intervalMs 间隔时间（毫秒）
   * @param fn 任务执行函数
   */
  repeat(name: string, intervalMs: number, fn: () => void | Promise<void>): this {
    this.cancel(name); // 先取消同名旧任务

    const entry: TaskEntry = {
      name,
      type: "repeat",
      status: "idle",
      createdAt: Date.now(),
      totalRuns: 0,
      successRuns: 0,
      failedRuns: 0,
      recentRuns: [],
      timer: null,
    };

    const runner = async () => {
      if (entry.status === "stopped") return;
      const startedAt = Date.now();
      entry.status = "running";
      try {
        await fn();
        const run: TaskRun = {
          runIndex: ++entry.totalRuns,
          startedAt,
          durationMs: Date.now() - startedAt,
          success: true,
        };
        entry.successRuns++;
        this.pushRun(entry, run);
        entry.status = "idle";
      } catch (err) {
        const run: TaskRun = {
          runIndex: ++entry.totalRuns,
          startedAt,
          durationMs: Date.now() - startedAt,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
        entry.failedRuns++;
        this.pushRun(entry, run);
        entry.status = "error";
      }
    };

    entry.timer = setInterval(runner, intervalMs);
    this.tasks.set(name, entry);
    return this;
  }

  /**
   * 注册一个延迟单次执行的任务（执行完毕后自动移除）
   *
   * @param name 任务名称
   * @param delayMs 延迟时间（毫秒）
   * @param fn 任务执行函数
   */
  delay(name: string, delayMs: number, fn: () => void | Promise<void>): this {
    this.cancel(name);

    const entry: TaskEntry = {
      name,
      type: "delay",
      status: "idle",
      createdAt: Date.now(),
      totalRuns: 0,
      successRuns: 0,
      failedRuns: 0,
      recentRuns: [],
      timer: null,
    };

    const runner = async () => {
      const startedAt = Date.now();
      entry.status = "running";
      try {
        await fn();
        const run: TaskRun = {
          runIndex: ++entry.totalRuns,
          startedAt,
          durationMs: Date.now() - startedAt,
          success: true,
        };
        entry.successRuns++;
        this.pushRun(entry, run);
        entry.status = "stopped";
      } catch (err) {
        const run: TaskRun = {
          runIndex: ++entry.totalRuns,
          startedAt,
          durationMs: Date.now() - startedAt,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
        entry.failedRuns++;
        this.pushRun(entry, run);
        entry.status = "error";
      }
      // delay 任务执行后自动从注册表移除
      this.tasks.delete(name);
    };

    entry.timer = setTimeout(runner, delayMs);
    this.tasks.set(name, entry);
    return this;
  }

  // ─── 取消 / 停止 ───────────────────────────────────────────────────────────

  /**
   * 取消并移除指定任务
   *
   * @param name 任务名称
   */
  cancel(name: string): boolean {
    const entry = this.tasks.get(name);
    if (!entry) return false;

    if (entry.timer !== null) {
      if (entry.type === "repeat") {
        clearInterval(entry.timer as ReturnType<typeof setInterval>);
      } else {
        clearTimeout(entry.timer as ReturnType<typeof setTimeout>);
      }
      entry.timer = null;
    }
    entry.status = "stopped";
    this.tasks.delete(name);
    return true;
  }

  /**
   * 停止所有任务（优雅关闭）
   */
  stopAll(): number {
    const names = Array.from(this.tasks.keys());
    for (const name of names) this.cancel(name);
    return names.length;
  }

  // ─── 查询 ──────────────────────────────────────────────────────────────────

  /**
   * 获取任务信息快照
   */
  getInfo(name: string): TaskInfo | undefined {
    const entry = this.tasks.get(name);
    if (!entry) return undefined;
    return this.toInfo(entry);
  }

  /**
   * 获取所有任务信息列表
   */
  listAll(): TaskInfo[] {
    return Array.from(this.tasks.values()).map((e) => this.toInfo(e));
  }

  /**
   * 检查任务是否存在
   */
  has(name: string): boolean {
    return this.tasks.has(name);
  }

  /** 当前任务总数 */
  get size(): number {
    return this.tasks.size;
  }

  // ─── 内部工具 ──────────────────────────────────────────────────────────────

  private pushRun(entry: TaskEntry, run: TaskRun): void {
    entry.recentRuns.push(run);
    if (entry.recentRuns.length > 10) entry.recentRuns.shift();
  }

  private toInfo(entry: TaskEntry): TaskInfo {
    return {
      name: entry.name,
      type: entry.type,
      status: entry.status,
      createdAt: entry.createdAt,
      totalRuns: entry.totalRuns,
      successRuns: entry.successRuns,
      failedRuns: entry.failedRuns,
      recentRuns: [...entry.recentRuns],
    };
  }
}

/**
 * @dream-xi/lock — Agent 并发锁工具
 *
 * 为 Dream XI AI 球员提供进程内异步互斥锁（Mutex）和信号量（Semaphore），
 * 防止多个异步操作同时修改共享资源（如记忆、状态机、计数器）。
 *
 * @example Mutex 互斥锁
 * ```ts
 * const mutex = new Mutex();
 *
 * async function updateMemory(playerId: string) {
 *   // 获取锁，critical section 结束后自动释放
 *   const release = await mutex.acquire();
 *   try {
 *     await writeToMemory(playerId, data);
 *   } finally {
 *     release();
 *   }
 * }
 *
 * // 语法糖：withLock 自动 acquire / release
 * await mutex.withLock(() => writeToMemory(playerId, data));
 * ```
 *
 * @example Semaphore 信号量（限制并发数）
 * ```ts
 * // 最多允许 3 个并发 LLM 调用
 * const sem = new Semaphore(3);
 * await sem.withLock(() => callLLM(prompt));
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────────────────

/** 释放锁的函数 */
export type ReleaseFunction = () => void;

/** 锁超时错误 */
export class LockTimeoutError extends Error {
  constructor(lockName: string, timeoutMs: number) {
    super(`Lock "${lockName}" acquisition timed out after ${timeoutMs}ms`);
    this.name = "LockTimeoutError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutex — 互斥锁（同时只允许 1 个持有者）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 异步互斥锁
 *
 * 同时只允许一个 async 任务持有锁，其余任务排队等待（FIFO）。
 * 不阻塞 Event Loop，使用 Promise 链实现。
 */
export class Mutex {
  readonly name: string;
  private queue: Array<() => void> = [];
  private locked = false;

  constructor(name = "mutex") {
    this.name = name;
  }

  /**
   * 获取锁，返回释放函数
   *
   * @param timeoutMs 获取锁的最大等待时间（毫秒），默认不限
   */
  acquire(timeoutMs?: number): Promise<ReleaseFunction> {
    return new Promise<ReleaseFunction>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          if (timer !== null) clearTimeout(timer);
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          // 从等待队列中移除
          const idx = this.queue.indexOf(tryAcquire);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new LockTimeoutError(this.name, timeoutMs));
        }, timeoutMs);
      }

      tryAcquire();
    });
  }

  /**
   * 以锁保护执行异步函数（自动 acquire / release）
   *
   * @param fn 需要互斥执行的异步函数
   * @param timeoutMs 获取锁超时（毫秒）
   */
  async withLock<T>(fn: () => T | Promise<T>, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** 当前是否被锁定 */
  get isLocked(): boolean {
    return this.locked;
  }

  /** 当前排队等待数量 */
  get queueLength(): number {
    return this.queue.length;
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Semaphore — 信号量（限制最大并发数）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 异步信号量
 *
 * 允许最多 `concurrency` 个任务同时持有令牌，超出则排队等待。
 * 适合限制 LLM API 并发调用数、数据库连接池等场景。
 */
export class Semaphore {
  readonly name: string;
  readonly concurrency: number;
  private available: number;
  private queue: Array<() => void> = [];

  /**
   * @param concurrency 最大并发持有数（>= 1）
   * @param name 信号量标识名（用于日志）
   */
  constructor(concurrency: number, name = "semaphore") {
    if (concurrency < 1) throw new RangeError("Semaphore concurrency must be >= 1");
    this.concurrency = concurrency;
    this.available = concurrency;
    this.name = name;
  }

  /**
   * 获取一个令牌，返回释放函数
   *
   * @param timeoutMs 等待超时（毫秒）
   */
  acquire(timeoutMs?: number): Promise<ReleaseFunction> {
    return new Promise<ReleaseFunction>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const tryAcquire = () => {
        if (this.available > 0) {
          this.available--;
          if (timer !== null) clearTimeout(timer);
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = this.queue.indexOf(tryAcquire);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new LockTimeoutError(this.name, timeoutMs));
        }, timeoutMs);
      }

      tryAcquire();
    });
  }

  /**
   * 以信号量保护执行异步函数
   */
  async withLock<T>(fn: () => T | Promise<T>, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** 当前可用令牌数 */
  get availableTokens(): number {
    return this.available;
  }

  /** 当前排队等待数 */
  get queueLength(): number {
    return this.queue.length;
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.available++;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LockManager — 命名锁注册中心
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 命名锁注册中心
 *
 * 按名称管理一组 Mutex，适合对不同资源（如不同球员 ID）使用独立互斥锁。
 *
 * @example
 * ```ts
 * const manager = new LockManager();
 *
 * // 对 "CR7" 的操作使用独立锁，不影响 "Messi" 的并发
 * await manager.withLock("CR7", () => updatePlayer("CR7"));
 * await manager.withLock("Messi", () => updatePlayer("Messi"));
 * ```
 */
export class LockManager {
  private readonly locks = new Map<string, Mutex>();

  /**
   * 获取或创建指定名称的 Mutex
   */
  getMutex(name: string): Mutex {
    let mutex = this.locks.get(name);
    if (!mutex) {
      mutex = new Mutex(name);
      this.locks.set(name, mutex);
    }
    return mutex;
  }

  /**
   * 以指定名称的锁保护执行函数
   */
  async withLock<T>(name: string, fn: () => T | Promise<T>, timeoutMs?: number): Promise<T> {
    return this.getMutex(name).withLock(fn, timeoutMs);
  }

  /**
   * 删除空闲锁（isLocked === false 且 queueLength === 0）以释放内存
   */
  cleanup(): number {
    let count = 0;
    for (const [name, mutex] of this.locks) {
      if (!mutex.isLocked && mutex.queueLength === 0) {
        this.locks.delete(name);
        count++;
      }
    }
    return count;
  }

  /** 当前管理的锁数量 */
  get size(): number {
    return this.locks.size;
  }
}

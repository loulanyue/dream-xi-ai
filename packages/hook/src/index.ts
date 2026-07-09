/**
 * @dream-xi/hook — Agent 生命周期钩子系统
 *
 * 为 Dream XI AI 球员提供可组合的生命周期钩子（Lifecycle Hook）机制：
 * - 定义标准 Agent 生命周期事件（onCreate / onReady / onMessage / onError / onDestroy）
 * - 支持任意自定义钩子名称
 * - 有序异步调用（串行或并行两种策略）
 * - 钩子优先级排序与一次性（once）钩子
 *
 * @example
 * ```ts
 * const hooks = new HookSystem<AgentLifecycle>();
 *
 * // 注册钩子
 * hooks.on("onReady", async (ctx) => {
 *   console.log("球员上场：", ctx.playerId);
 * });
 *
 * hooks.once("onDestroy", async (ctx) => {
 *   console.log("球员退场清理：", ctx.playerId);
 * });
 *
 * // 触发钩子（串行执行所有注册函数）
 * await hooks.emit("onReady", { playerId: "CR7", timestamp: Date.now() });
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 钩子调用策略 */
export type HookStrategy = "serial" | "parallel";

/** 单个钩子处理函数 */
export type HookHandler<T> = (payload: T) => void | Promise<void>;

/** 内部注册条目 */
interface HookEntry<T> {
  handler: HookHandler<T>;
  once: boolean;
  priority: number;
}

/** emit 调用结果记录 */
export interface HookEmitResult {
  /** 钩子名称 */
  hookName: string;
  /** 成功执行的处理函数数量 */
  invoked: number;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 失败的错误列表（parallel 策略下可能有多个） */
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 标准生命周期事件定义（可扩展）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dream XI Agent 球员标准生命周期载荷
 *
 * 使用示例：
 * ```ts
 * const hooks = new HookSystem<AgentLifecycle>();
 * hooks.on("onReady", async ({ playerId }) => { ... });
 * ```
 */
export interface AgentLifecycle {
  /** 球员实例创建完毕（配置已加载） */
  onCreate: { playerId: string; config: Record<string, unknown> };
  /** 球员已就绪，可接受消息 */
  onReady: { playerId: string; timestamp: number };
  /** 球员收到一条新消息 */
  onMessage: { playerId: string; messageId: string; content: string; threadId?: string };
  /** 球员回复消息完成 */
  onReply: { playerId: string; messageId: string; reply: string; durationMs: number };
  /** 球员运行过程中发生错误 */
  onError: { playerId: string; error: string; context?: string };
  /** 球员即将销毁（清理资源） */
  onDestroy: { playerId: string; reason?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// HookSystem 核心类
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 生命周期钩子系统
 *
 * @template TMap 钩子名称 → 载荷类型的映射（可以是 AgentLifecycle 或自定义类型）
 */
export class HookSystem<TMap extends Record<string, unknown>> {
  private readonly registry = new Map<string, HookEntry<unknown>[]>();
  /** 全局默认调用策略 */
  private readonly strategy: HookStrategy;

  constructor(strategy: HookStrategy = "serial") {
    this.strategy = strategy;
  }

  // ─── 注册 ────────────────────────────────────────────────────────────────

  /**
   * 注册一个持久钩子（每次 emit 都会触发）
   *
   * @param name 钩子名称
   * @param handler 处理函数
   * @param priority 优先级（数字越小越先执行，默认 100）
   */
  on<K extends keyof TMap & string>(
    name: K,
    handler: HookHandler<TMap[K]>,
    priority = 100,
  ): () => void {
    return this.addEntry(name, handler as HookHandler<unknown>, false, priority);
  }

  /**
   * 注册一个一次性钩子（触发一次后自动注销）
   *
   * @param name 钩子名称
   * @param handler 处理函数
   * @param priority 优先级（默认 100）
   */
  once<K extends keyof TMap & string>(
    name: K,
    handler: HookHandler<TMap[K]>,
    priority = 100,
  ): () => void {
    return this.addEntry(name, handler as HookHandler<unknown>, true, priority);
  }

  /**
   * 注销指定钩子名称下的某个处理函数
   */
  off<K extends keyof TMap & string>(name: K, handler: HookHandler<TMap[K]>): boolean {
    const entries = this.registry.get(name);
    if (!entries) return false;
    const before = entries.length;
    const filtered = entries.filter((e) => e.handler !== (handler as HookHandler<unknown>));
    this.registry.set(name, filtered);
    return filtered.length < before;
  }

  /** 清空某个钩子的所有处理函数 */
  clear<K extends keyof TMap & string>(name: K): void {
    this.registry.delete(name);
  }

  /** 清空所有钩子 */
  clearAll(): void {
    this.registry.clear();
  }

  // ─── 触发 ────────────────────────────────────────────────────────────────

  /**
   * 触发指定钩子，执行所有已注册的处理函数
   *
   * @param name 钩子名称
   * @param payload 传递给处理函数的载荷
   * @param strategy 覆盖全局策略（可选）
   */
  async emit<K extends keyof TMap & string>(
    name: K,
    payload: TMap[K],
    strategy?: HookStrategy,
  ): Promise<HookEmitResult> {
    const startedAt = Date.now();
    const entries = [...(this.registry.get(name) ?? [])];

    // 按优先级升序排列
    entries.sort((a, b) => a.priority - b.priority);

    // 移除 once 条目
    const keepEntries = entries.filter((e) => !e.once);
    this.registry.set(name, keepEntries);

    const errors: string[] = [];
    const mode = strategy ?? this.strategy;

    if (mode === "parallel") {
      const results = await Promise.allSettled(entries.map((e) => e.handler(payload)));
      for (const r of results) {
        if (r.status === "rejected") {
          errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
      }
    } else {
      // serial
      for (const entry of entries) {
        try {
          await entry.handler(payload);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }

    return {
      hookName: name,
      invoked: entries.length,
      durationMs: Date.now() - startedAt,
      errors,
    };
  }

  // ─── 查询 ────────────────────────────────────────────────────────────────

  /** 获取某个钩子已注册的处理函数数量 */
  count<K extends keyof TMap & string>(name: K): number {
    return this.registry.get(name)?.length ?? 0;
  }

  /** 获取所有已注册钩子名称 */
  hookNames(): string[] {
    return Array.from(this.registry.keys());
  }

  // ─── 内部 ────────────────────────────────────────────────────────────────

  private addEntry(
    name: string,
    handler: HookHandler<unknown>,
    once: boolean,
    priority: number,
  ): () => void {
    if (!this.registry.has(name)) {
      this.registry.set(name, []);
    }
    const entry: HookEntry<unknown> = { handler, once, priority };
    this.registry.get(name)?.push(entry);
    // 返回注销函数
    return () => {
      const entries = this.registry.get(name);
      if (!entries) return;
      this.registry.set(
        name,
        entries.filter((e) => e !== entry),
      );
    };
  }
}

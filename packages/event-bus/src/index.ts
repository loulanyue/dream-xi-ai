/**
 * @dream-xi/event-bus — In-Memory 事件总线实现
 *
 * 实现 `@dream-xi/types` 中定义的 `EventBus` 接口。
 *
 * 设计特点：
 *   - 纯 In-Memory，零依赖（不需要 Redis / NATS）
 *   - 异步订阅者并行执行，单个失败不影响其他订阅者
 *   - 支持通配符订阅 `"*"`、按来源过滤
 *   - `once()` 一次性订阅，触发后自动注销
 *   - `waitFor()` Promise 风格等待，支持超时
 *   - 完整调试工具：`subscriberCount()` / `clear()` / `snapshot()`
 *
 * @example
 * ```ts
 * import { createEventBus } from "@dream-xi/event-bus";
 *
 * const bus = createEventBus({ debug: true });
 *
 * bus.subscribe({ types: ["message.route.resolved"] }, (e) => {
 *   console.log("路由到球员:", e.payload.targetPlayer);
 * });
 *
 * await bus.emit(factory.messageRouteResolved({ ... }));
 * ```
 *
 * @module
 */

import type {
  AnyDreamXiEvent,
  EventBus,
  EventFilter,
  EventHandler,
  EventId,
  EventSubscription,
  EventType,
} from "@dream-xi/types";
import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数配置
// ─────────────────────────────────────────────────────────────────────────────

/** `createEventBus` 配置项 */
export interface EventBusOptions {
  /**
   * 开启调试模式：每次 emit/subscribe/unsubscribe 都打印日志。
   * @default false
   */
  debug?: boolean;
  /**
   * 订阅者执行超时时间（毫秒）。
   * 超时后打印警告，但不中断其他订阅者。
   * @default 5000
   */
  handlerTimeoutMs?: number;
  /**
   * 最大订阅者数量上限（防止内存泄漏）。
   * 超出后新订阅者注册会抛出 Error。
   * @default 1000
   */
  maxSubscribers?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部订阅者记录
// ─────────────────────────────────────────────────────────────────────────────

interface Subscriber {
  id: string;
  filter: EventFilter;
  handler: EventHandler;
  once: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 事件匹配逻辑
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 判断事件是否匹配订阅过滤器。
 *
 * 规则：
 *   1. `filter.types` 包含 `"*"` → 匹配所有类型
 *   2. `filter.types` 包含该事件的 `type` → 匹配
 *   3. 若指定了 `filter.source`，还需事件 `source` 字段一致
 */
function matchesFilter(event: AnyDreamXiEvent, filter: EventFilter): boolean {
  const typeMatch =
    filter.types.includes("*") || filter.types.includes(event.type as EventType);

  if (!typeMatch) return false;

  if (filter.source !== undefined && event.source !== filter.source) {
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemoryEventBus 实现
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-Memory 事件总线。
 *
 * 通过 `createEventBus()` 工厂函数创建实例，
 * 不建议直接 `new InMemoryEventBus()`。
 */
export class InMemoryEventBus implements EventBus {
  private readonly subscribers = new Map<string, Subscriber>();
  private readonly options: Required<EventBusOptions>;
  private emitCount = 0;

  constructor(options: EventBusOptions = {}) {
    this.options = {
      debug: options.debug ?? false,
      handlerTimeoutMs: options.handlerTimeoutMs ?? 5000,
      maxSubscribers: options.maxSubscribers ?? 1000,
    };
  }

  // ── emit ──────────────────────────────────────────────────────────────────

  /**
   * 发布事件，并发通知所有匹配的订阅者。
   * 等待所有订阅者处理完毕后 resolve（即使某个订阅者抛出异常）。
   */
  async emit(event: AnyDreamXiEvent): Promise<void> {
    this.emitCount++;

    if (this.options.debug) {
      console.log(
        `[EventBus] emit #${this.emitCount} type=${event.type} id=${event.id}`,
      );
    }

    // 收集匹配的订阅者（快照，避免在遍历中修改 map）
    const matched: Subscriber[] = [];
    for (const sub of this.subscribers.values()) {
      if (matchesFilter(event, sub.filter)) {
        matched.push(sub);
      }
    }

    // 并发执行所有匹配的订阅者，带超时保护
    await Promise.allSettled(
      matched.map(async (sub) => {
        // once 订阅：触发前先注销
        if (sub.once) {
          this.subscribers.delete(sub.id);
          if (this.options.debug) {
            console.log(`[EventBus] once subscriber ${sub.id} auto-unsubscribed`);
          }
        }

        try {
          await Promise.race([
            Promise.resolve(sub.handler(event as never)),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Handler timeout after ${this.options.handlerTimeoutMs}ms`)),
                this.options.handlerTimeoutMs,
              ),
            ),
          ]);
        } catch (err) {
          // 单个订阅者失败不影响其他订阅者
          console.warn(
            `[EventBus] subscriber ${sub.id} handler error for event ${event.type}:`,
            err,
          );
        }
      }),
    );
  }

  // ── subscribe ─────────────────────────────────────────────────────────────

  /**
   * 订阅事件。
   * @returns 可取消的 `EventSubscription` 令牌
   */
  subscribe<T extends AnyDreamXiEvent>(
    filter: EventFilter,
    handler: EventHandler<T>,
  ): EventSubscription {
    return this._addSubscriber(filter, handler as EventHandler, false);
  }

  // ── once ──────────────────────────────────────────────────────────────────

  /**
   * 订阅一次性事件，触发后自动注销。
   */
  once<T extends AnyDreamXiEvent>(
    filter: EventFilter,
    handler: EventHandler<T>,
  ): EventSubscription {
    return this._addSubscriber(filter, handler as EventHandler, true);
  }

  // ── waitFor ───────────────────────────────────────────────────────────────

  /**
   * Promise 风格等待某事件类型触发。
   *
   * @param type 事件类型
   * @param timeoutMs 超时时间（默认 10000ms）
   * @throws 超时后 reject
   *
   * @example
   * ```ts
   * const event = await bus.waitFor("system.server.started", 5000);
   * console.log("服务器已启动，端口:", event.payload.port);
   * ```
   */
  waitFor<T extends AnyDreamXiEvent>(
    type: T["type"],
    timeoutMs = 10_000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const sub = this.once<T>(
        { types: [type as EventType] },
        (event) => {
          if (timeoutHandle !== null) clearTimeout(timeoutHandle);
          resolve(event);
        },
      );

      timeoutHandle = setTimeout(() => {
        sub.unsubscribe();
        reject(
          new Error(
            `[EventBus] waitFor("${type}") timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });
  }

  // ── subscriberCount ───────────────────────────────────────────────────────

  /** 当前活跃订阅者数量（调试用） */
  subscriberCount(): number {
    return this.subscribers.size;
  }

  // ── clear ─────────────────────────────────────────────────────────────────

  /** 清除所有订阅者（测试清理用） */
  clear(): void {
    const count = this.subscribers.size;
    this.subscribers.clear();
    if (this.options.debug) {
      console.log(`[EventBus] cleared ${count} subscribers`);
    }
  }

  // ── snapshot ──────────────────────────────────────────────────────────────

  /**
   * 获取所有订阅者快照（调试/监控用）。
   * 返回数组，每项包含订阅者 ID、过滤条件、注册时间。
   */
  snapshot(): ReadonlyArray<{
    id: string;
    types: ReadonlyArray<string>;
    source?: string;
    once: boolean;
    createdAt: string;
  }> {
    return Array.from(this.subscribers.values()).map((sub) => ({
      id: sub.id,
      types: sub.filter.types,
      source: sub.filter.source,
      once: sub.once,
      createdAt: sub.createdAt,
    }));
  }

  /** 总发布事件次数（统计用） */
  get totalEmitted(): number {
    return this.emitCount;
  }

  // ── 内部：注册订阅者 ───────────────────────────────────────────────────────

  private _addSubscriber(
    filter: EventFilter,
    handler: EventHandler,
    once: boolean,
  ): EventSubscription {
    if (this.subscribers.size >= this.options.maxSubscribers) {
      throw new Error(
        `[EventBus] max subscribers (${this.options.maxSubscribers}) reached. ` +
          "Call unsubscribe() on unused subscriptions to avoid memory leaks.",
      );
    }

    const id = randomUUID();
    const sub: Subscriber = {
      id,
      filter,
      handler,
      once,
      createdAt: new Date().toISOString(),
    };
    this.subscribers.set(id, sub);

    if (this.options.debug) {
      console.log(
        `[EventBus] subscribe id=${id} types=${filter.types.join(",")} once=${once}`,
      );
    }

    return {
      id,
      unsubscribe: () => {
        this.subscribers.delete(id);
        if (this.options.debug) {
          console.log(`[EventBus] unsubscribe id=${id}`);
        }
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建 In-Memory 事件总线实例。
 *
 * @param options 可选配置
 * @returns `InMemoryEventBus` 实例（实现 `EventBus` 接口）
 *
 * @example
 * ```ts
 * // 生产环境
 * const bus = createEventBus();
 *
 * // 开发调试
 * const bus = createEventBus({ debug: true });
 *
 * // 测试（低超时 + 低上限）
 * const bus = createEventBus({ handlerTimeoutMs: 500, maxSubscribers: 50 });
 * ```
 */
export function createEventBus(options?: EventBusOptions): InMemoryEventBus {
  return new InMemoryEventBus(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// 单例模式（可选）
// ─────────────────────────────────────────────────────────────────────────────

let _globalBus: InMemoryEventBus | null = null;

/**
 * 获取全局单例事件总线。
 *
 * 适合在同一进程内共享一个事件总线的场景。
 * 若需要隔离（如多租户、测试），请使用 `createEventBus()` 创建独立实例。
 *
 * @example
 * ```ts
 * // packages/server/src/main.ts
 * import { getGlobalEventBus } from "@dream-xi/event-bus";
 * const bus = getGlobalEventBus();
 * ```
 */
export function getGlobalEventBus(): InMemoryEventBus {
  if (_globalBus === null) {
    _globalBus = new InMemoryEventBus({ debug: process.env["NODE_ENV"] === "development" });
  }
  return _globalBus;
}

/**
 * 重置全局单例（测试专用）。
 * 生产代码中不应调用此函数。
 */
export function resetGlobalEventBus(): void {
  _globalBus?.clear();
  _globalBus = null;
}

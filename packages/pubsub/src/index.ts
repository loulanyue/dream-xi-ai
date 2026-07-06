/**
 * @dream-xi/pubsub — 进程内发布/订阅消息总线
 *
 * 为 Dream XI AI 提供轻量级、类型安全的 Pub/Sub 通信层：
 *
 *   - **通配符主题**：`player.*` 订阅所有球员事件；`*` 订阅全局
 *   - **类型安全**：泛型 `PubSub<TopicMap>` 让编译器检查 topic 和 payload 匹配
 *   - **异步派发**：`publish()` 异步调用所有订阅者，不阻塞发布方
 *   - **同步派发**：`publishSync()` 用于测试或需要确定性执行顺序的场景
 *   - **一次性监听**：`once()` 收到第一条消息后自动取消订阅
 *   - **消息过滤**：订阅时可传 `filter` 谓词，只处理满足条件的消息
 *   - **取消订阅**：`subscribe()` 返回 `Unsubscribe` 函数，调用即取消
 *   - **错误隔离**：单个订阅者抛出异常不影响其他订阅者执行
 *   - **历史回放**：`retain: true` 保留最后一条消息，新订阅者立即收到
 *
 * @example
 * ```ts
 * import { PubSub } from "@dream-xi/pubsub";
 *
 * // 定义 Topic → Payload 映射
 * interface Events {
 *   "match.start":  { matchId: string; homeTeam: string };
 *   "match.goal":   { matchId: string; scorer: string; minute: number };
 *   "match.end":    { matchId: string; score: [number, number] };
 *   "player.sub":   { matchId: string; in: string; out: string };
 * }
 *
 * const bus = new PubSub<Events>();
 *
 * // 精确订阅
 * const unsub = bus.subscribe("match.goal", (payload) => {
 *   console.log(`⚽ ${payload.scorer} scored at minute ${payload.minute}`);
 * });
 *
 * // 通配符订阅：所有 match.* 事件
 * bus.subscribe("match.*", (payload, topic) => {
 *   console.log(`[${topic}]`, payload);
 * });
 *
 * // 发布
 * await bus.publish("match.goal", { matchId: "final", scorer: "梦行者", minute: 90 });
 *
 * // 取消订阅
 * unsub();
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Topic → Payload 映射接口。
 * 用户通过泛型参数传入自己的映射，获得完整类型推断。
 */
export type TopicMap = object;

/** 取消订阅函数 */
export type Unsubscribe = () => void;

/** 订阅回调函数 */
export type Subscriber<T> = (payload: T, topic: string) => void | Promise<void>;

/** `subscribe()` 选项 */
export interface SubscribeOptions<T> {
  /**
   * 消息过滤谓词。
   * 只有 `filter(payload)` 返回 true 时，才调用订阅回调。
   */
  filter?: (payload: T) => boolean;
  /**
   * 是否为一次性监听。
   * 收到第一条（通过 filter 的）消息后自动取消订阅。
   * @default false
   */
  once?: boolean;
  /**
   * 是否立即接收历史保留消息（retain 消息）。
   * @default true
   */
  receiveRetained?: boolean;
}

/** `PubSub` 构造选项 */
export interface PubSubOptions {
  /**
   * 发布时是否捕获订阅者抛出的异常（防止影响其他订阅者）。
   * @default true
   */
  catchErrors?: boolean;
  /**
   * 异常捕获时的错误处理回调。
   */
  onError?: (err: unknown, topic: string, subscriber: Subscriber<unknown>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部订阅记录
// ─────────────────────────────────────────────────────────────────────────────

interface Subscription<T> {
  id: number;
  pattern: string; // 原始 pattern，可含 *
  regex: RegExp; // 编译后的正则
  callback: Subscriber<T>;
  filter?: (payload: T) => boolean;
  once: boolean;
  active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具：pattern → RegExp
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将订阅 pattern 编译为正则表达式：
 *   `*`  → 匹配当前段（非 `.`）
 *   `**` → 匹配任意多段
 *   其余字符逐字匹配
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义 regex 特殊字符（保留 *）
    .replace(/\\\*/g, "*") // 还原 * 为未转义
    .replace(/\*\*/g, "__GLOBSTAR__") // 临时保护 **
    .replace(/\*/g, "[^.]+") // * → 匹配单段
    .replace(/__GLOBSTAR__/g, ".+"); // ** → 匹配多段
  return new RegExp(`^${escaped}$`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PubSub 实现
// ─────────────────────────────────────────────────────────────────────────────

let _subId = 0;

/**
 * 类型安全的进程内发布/订阅消息总线。
 *
 * @template TMap Topic → Payload 映射，不传则使用 `Record<string, unknown>`
 *
 * @example
 * ```ts
 * // 无类型约束（宽松模式）
 * const bus = new PubSub();
 * bus.subscribe("any.topic", console.log);
 *
 * // 有类型约束（严格模式）
 * const bus = new PubSub<{ "user.login": { userId: string } }>();
 * bus.subscribe("user.login", ({ userId }) => console.log(userId));
 * ```
 */
export class PubSub<TMap extends TopicMap = Record<string, unknown>> {
  private readonly subs: Map<number, Subscription<unknown>> = new Map();
  private readonly retained: Map<string, unknown> = new Map();
  private readonly catchErrors: boolean;
  private readonly onError: (err: unknown, topic: string, sub: Subscriber<unknown>) => void;

  constructor(options: PubSubOptions = {}) {
    this.catchErrors = options.catchErrors ?? true;
    this.onError =
      options.onError ??
      ((err, topic) => {
        console.error(`[PubSub] subscriber error on topic "${topic}":`, err);
      });
  }

  // ── subscribe ─────────────────────────────────────────────────────────────

  /**
   * 订阅一个 topic（支持 `*` 和 `**` 通配符）。
   *
   * @param pattern Topic 模式，如 `"match.goal"` / `"match.*"` / `"**"`
   * @param callback 消息回调
   * @param options 过滤、一次性等选项
   * @returns 取消订阅函数
   *
   * @example
   * ```ts
   * // 精确订阅
   * const off = bus.subscribe("match.goal", handler);
   * // 取消
   * off();
   *
   * // 通配符
   * bus.subscribe("player.*", (payload, topic) => { ... });
   *
   * // 一次性
   * bus.once("match.end", (payload) => { ... });
   * ```
   */
  subscribe<K extends string & keyof TMap>(
    pattern: K | (string & {}),
    callback: Subscriber<K extends keyof TMap ? TMap[K] : unknown>,
    options: SubscribeOptions<K extends keyof TMap ? TMap[K] : unknown> = {},
  ): Unsubscribe {
    const id = ++_subId;
    const sub: Subscription<unknown> = {
      id,
      pattern,
      regex: patternToRegex(pattern),
      callback: callback as Subscriber<unknown>,
      once: options.once ?? false,
      active: true,
      ...(options.filter !== undefined
        ? { filter: options.filter as (payload: unknown) => boolean }
        : {}),
    };

    this.subs.set(id, sub);

    // 立即派发 retain 消息（若有）
    if (options.receiveRetained !== false) {
      for (const [topic, payload] of this.retained) {
        if (sub.regex.test(topic)) {
          this._deliver(sub, payload, topic, /* sync */ true);
          if (!sub.active) break; // once 已消费
        }
      }
    }

    return () => {
      sub.active = false;
      this.subs.delete(id);
    };
  }

  /**
   * 订阅一次性监听（等同 `subscribe(pattern, cb, { once: true })`）。
   */
  once<K extends string & keyof TMap>(
    pattern: K | (string & {}),
    callback: Subscriber<K extends keyof TMap ? TMap[K] : unknown>,
    options?: Omit<SubscribeOptions<K extends keyof TMap ? TMap[K] : unknown>, "once">,
  ): Unsubscribe {
    return this.subscribe(pattern, callback, { ...options, once: true });
  }

  // ── publish ───────────────────────────────────────────────────────────────

  /**
   * 异步发布消息到 topic。
   * 所有匹配的订阅者异步并行调用（`Promise.allSettled`）。
   *
   * @param topic 精确 topic（不含通配符）
   * @param payload 消息载荷
   * @param retain 是否保留此消息（新订阅者立即收到）
   */
  async publish<K extends string & keyof TMap>(
    topic: K,
    payload: TMap[K],
    retain = false,
  ): Promise<void> {
    if (retain) this.retained.set(topic as string, payload);
    const matched = this._match(topic as string);
    await Promise.allSettled(
      matched.map((sub) => this._deliver(sub, payload, topic as string, false)),
    );
    this._sweep();
  }

  /**
   * 同步发布消息（依次调用订阅者，等待每个完成）。
   * 适合测试或需要确定性执行顺序的场景。
   */
  publishSync<K extends string & keyof TMap>(topic: K, payload: TMap[K], retain = false): void {
    if (retain) this.retained.set(topic as string, payload);
    const matched = this._match(topic as string);
    for (const sub of matched) {
      this._deliver(sub, payload, topic as string, true);
    }
    this._sweep();
  }

  // ── clear ─────────────────────────────────────────────────────────────────

  /** 取消所有订阅 */
  clearSubscriptions(): void {
    for (const sub of this.subs.values()) {
      sub.active = false;
    }
    this.subs.clear();
  }

  /** 清除指定 topic 的 retain 消息 */
  clearRetained(topic: string): void {
    this.retained.delete(topic);
  }

  /** 清除所有 retain 消息 */
  clearAllRetained(): void {
    this.retained.clear();
  }

  // ── stats ─────────────────────────────────────────────────────────────────

  /** 当前活跃订阅数 */
  get subscriberCount(): number {
    return this.subs.size;
  }

  /** 当前 retain 消息数 */
  get retainedCount(): number {
    return this.retained.size;
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  private _match(topic: string): Subscription<unknown>[] {
    const result: Subscription<unknown>[] = [];
    for (const sub of this.subs.values()) {
      if (sub.active && sub.regex.test(topic)) {
        result.push(sub);
      }
    }
    return result;
  }

  private _deliver(
    sub: Subscription<unknown>,
    payload: unknown,
    topic: string,
    sync: boolean,
  ): void | Promise<void> {
    if (!sub.active) return;
    if (sub.filter && !sub.filter(payload)) return;

    if (sub.once) {
      sub.active = false;
      this.subs.delete(sub.id);
    }

    const invoke = (): void | Promise<void> => {
      if (this.catchErrors) {
        try {
          const ret = sub.callback(payload, topic);
          if (ret instanceof Promise) {
            return ret.catch((err: unknown) => this.onError(err, topic, sub.callback));
          }
        } catch (err) {
          this.onError(err, topic, sub.callback);
        }
      } else {
        return sub.callback(payload, topic) as void | Promise<void>;
      }
    };

    if (sync) {
      invoke();
    } else {
      return Promise.resolve().then(invoke);
    }
  }

  private _sweep(): void {
    for (const [id, sub] of this.subs) {
      if (!sub.active) this.subs.delete(id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────────────────────────────────────

/** 创建 PubSub 实例 */
export function createPubSub<TMap extends TopicMap = Record<string, unknown>>(
  options?: PubSubOptions,
): PubSub<TMap> {
  return new PubSub<TMap>(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream XI 预设消息总线
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dream XI AI 全局事件 Topic → Payload 映射
 */
export interface DreamXiTopics {
  // 比赛事件
  "match.start": { matchId: string; homeTeam: string; awayTeam: string };
  "match.goal": { matchId: string; scorer: string; minute: number; team: string };
  "match.end": { matchId: string; score: [number, number]; winner: string | null };
  // 球员事件
  "player.sub": { matchId: string; in: string; out: string; minute: number };
  "player.injury": { matchId: string; player: string; severity: "minor" | "major" };
  // 战术事件
  "tactic.changed": { matchId: string; newTactic: string; reason: string };
  "tactic.evaluated": { matchId: string; tactic: string; score: number };
  // LLM 任务事件
  "llm.request": { taskId: string; model: string; promptHash: string };
  "llm.response": { taskId: string; durationMs: number; tokensUsed: number };
  "llm.error": { taskId: string; error: string; retryable: boolean };
  // 系统事件
  "system.startup": { version: string; startedAt: string };
  "system.shutdown": { reason: string };
  "system.error": { source: string; message: string; fatal: boolean };
}

/**
 * Dream XI AI 全局消息总线（单例）。
 *
 * @example
 * ```ts
 * import { dreamXiBus } from "@dream-xi/pubsub";
 *
 * // 订阅所有 LLM 事件
 * dreamXiBus.subscribe("llm.*", (payload, topic) => {
 *   console.log(`[${topic}]`, payload);
 * });
 *
 * // 发布
 * await dreamXiBus.publish("match.goal", {
 *   matchId: "wc-final", scorer: "梦行者", minute: 90, team: "dream-xi"
 * });
 * ```
 */
export const dreamXiBus = createPubSub<DreamXiTopics>({
  catchErrors: true,
  onError: (err, topic) => {
    console.error(`[DreamXiBus] error on topic "${topic}":`, err);
  },
});

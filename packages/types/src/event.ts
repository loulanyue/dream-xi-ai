/**
 * @dream-xi/types — 平台事件系统类型（Event System Types）
 *
 * Dream XI AI 的事件总线（Event Bus）基础类型。
 * 所有平台内部事件均继承自 `DreamXiEvent`，通过事件总线广播。
 *
 * 设计原则（来自 docs/ARCHITECTURE.md § ADR-005）：
 *   - 所有事件均为不可变值对象（readonly）
 *   - 每个事件携带 `id`、`type`、`timestamp` 三个必填字段
 *   - 事件分四大类：消息事件、记忆事件、路由事件、系统事件
 *   - 订阅者通过 `EventFilter` 过滤感兴趣的事件类型
 *
 * @module
 */

import type { PlayerId } from "./player.js";
import type { MessageId, ThreadId } from "./message.js";
import type { MemoryId, MemoryLayer } from "./memory.js";

// ─────────────────────────────────────────────────────────────────────────────
// 基础事件结构
// ─────────────────────────────────────────────────────────────────────────────

/** 全局唯一事件 ID（UUID v4） */
export type EventId = string & { readonly __brand: "EventId" };

/** 事件版本（用于向后兼容）  */
export type EventVersion = 1;

/**
 * 所有平台事件的基类。
 * 具体事件类型通过 `type` 字段区分（discriminated union）。
 */
export interface DreamXiEvent {
  /** 全局唯一事件 ID */
  readonly id: EventId;
  /** 事件类型（作为 discriminant） */
  readonly type: EventType;
  /** ISO 8601 时间戳（UTC） */
  readonly timestamp: string;
  /** 事件版本，用于 schema 迁移 */
  readonly version: EventVersion;
  /** 触发事件的来源球员或系统（可选，用于审计） */
  readonly source?: PlayerId | "coach" | "system";
}

// ─────────────────────────────────────────────────────────────────────────────
// 事件类型枚举
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 平台事件类型总览。
 *
 * 命名规范：`<领域>.<动词>.<状态>`
 * 例：`message.send.requested`、`memory.write.completed`
 */
export type EventType =
  // ── 消息事件 ────────────────────────────────────────────────
  | "message.send.requested"     // 用户/系统发起新消息
  | "message.route.resolved"     // 路由器已确定目标球员
  | "message.deliver.started"    // 开始向目标球员投递
  | "message.deliver.completed"  // 投递成功（球员已接收）
  | "message.deliver.failed"     // 投递失败（含错误原因）
  | "message.reply.received"     // 球员回复已到达
  // ── 线程事件 ────────────────────────────────────────────────
  | "thread.created"             // 新线程创建
  | "thread.status.changed"      // 线程状态变更（open/closed/archived）
  // ── 记忆事件 ────────────────────────────────────────────────
  | "memory.write.requested"     // 请求写入记忆
  | "memory.write.completed"     // 记忆写入成功
  | "memory.write.failed"        // 记忆写入失败
  | "memory.evict.completed"     // 记忆条目被逐出（容量限制）
  | "memory.search.completed"    // 语义搜索完成
  // ── 路由事件 ────────────────────────────────────────────────
  | "router.fallback.triggered"  // 路由回退到默认球员（Leo）
  | "router.mention.parsed"      // 解析到显式 @mention
  | "router.intent.inferred"     // 意图推断完成
  // ── 公平竞技事件 ────────────────────────────────────────────
  | "fairplay.violation.detected" // 检测到公平竞技违规
  | "fairplay.violation.blocked"  // 违规内容已被拦截
  // ── 系统事件 ────────────────────────────────────────────────
  | "system.server.started"      // HTTP 服务器启动成功
  | "system.server.stopped"      // HTTP 服务器停止
  | "system.config.loaded"       // 配置加载完成
  | "system.config.invalid"      // 配置验证失败
  | "system.health.checked";     // 健康检查触发

// ─────────────────────────────────────────────────────────────────────────────
// 消息事件
// ─────────────────────────────────────────────────────────────────────────────

/** 用户发起新消息事件 */
export interface MessageSendRequestedEvent extends DreamXiEvent {
  readonly type: "message.send.requested";
  readonly payload: {
    readonly threadId: ThreadId;
    readonly text: string;
    readonly senderId: PlayerId | "coach" | "system";
  };
}

/** 路由解析完成事件 */
export interface MessageRouteResolvedEvent extends DreamXiEvent {
  readonly type: "message.route.resolved";
  readonly payload: {
    readonly messageId: MessageId;
    readonly threadId: ThreadId;
    readonly targetPlayer: PlayerId;
    /** 路由策略：mention | intent | fallback */
    readonly strategy: "mention" | "intent" | "fallback";
    /** 意图推断置信度（0-1，mention 时为 1） */
    readonly confidence: number;
  };
}

/** 消息投递开始事件 */
export interface MessageDeliverStartedEvent extends DreamXiEvent {
  readonly type: "message.deliver.started";
  readonly payload: {
    readonly messageId: MessageId;
    readonly targetPlayer: PlayerId;
  };
}

/** 消息投递成功事件 */
export interface MessageDeliverCompletedEvent extends DreamXiEvent {
  readonly type: "message.deliver.completed";
  readonly payload: {
    readonly messageId: MessageId;
    readonly targetPlayer: PlayerId;
    /** 投递耗时（毫秒） */
    readonly durationMs: number;
  };
}

/** 消息投递失败事件 */
export interface MessageDeliverFailedEvent extends DreamXiEvent {
  readonly type: "message.deliver.failed";
  readonly payload: {
    readonly messageId: MessageId;
    readonly targetPlayer: PlayerId;
    readonly reason: string;
    readonly retryable: boolean;
  };
}

/** 球员回复到达事件 */
export interface MessageReplyReceivedEvent extends DreamXiEvent {
  readonly type: "message.reply.received";
  readonly payload: {
    readonly replyMessageId: MessageId;
    readonly originalMessageId: MessageId;
    readonly threadId: ThreadId;
    readonly fromPlayer: PlayerId;
    readonly text: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 线程事件
// ─────────────────────────────────────────────────────────────────────────────

/** 线程创建事件 */
export interface ThreadCreatedEvent extends DreamXiEvent {
  readonly type: "thread.created";
  readonly payload: {
    readonly threadId: ThreadId;
    readonly participants: ReadonlyArray<PlayerId | "coach" | "system">;
    readonly title?: string;
  };
}

/** 线程状态变更事件 */
export interface ThreadStatusChangedEvent extends DreamXiEvent {
  readonly type: "thread.status.changed";
  readonly payload: {
    readonly threadId: ThreadId;
    readonly from: "open" | "closed" | "archived";
    readonly to: "open" | "closed" | "archived";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 记忆事件
// ─────────────────────────────────────────────────────────────────────────────

/** 记忆写入请求事件 */
export interface MemoryWriteRequestedEvent extends DreamXiEvent {
  readonly type: "memory.write.requested";
  readonly payload: {
    readonly layer: MemoryLayer;
    readonly playerId: PlayerId;
    readonly contentPreview: string; // 内容摘要（非完整内容，避免日志泄漏）
  };
}

/** 记忆写入成功事件 */
export interface MemoryWriteCompletedEvent extends DreamXiEvent {
  readonly type: "memory.write.completed";
  readonly payload: {
    readonly memoryId: MemoryId;
    readonly layer: MemoryLayer;
    readonly playerId: PlayerId;
    readonly durationMs: number;
  };
}

/** 记忆写入失败事件 */
export interface MemoryWriteFailedEvent extends DreamXiEvent {
  readonly type: "memory.write.failed";
  readonly payload: {
    readonly layer: MemoryLayer;
    readonly playerId: PlayerId;
    readonly reason: string;
  };
}

/** 记忆逐出事件（LRU/TTL 触发） */
export interface MemoryEvictCompletedEvent extends DreamXiEvent {
  readonly type: "memory.evict.completed";
  readonly payload: {
    readonly memoryId: MemoryId;
    readonly layer: MemoryLayer;
    readonly playerId: PlayerId;
    /** 逐出原因：capacity（容量限制）| ttl（超时） */
    readonly reason: "capacity" | "ttl";
  };
}

/** 语义搜索完成事件 */
export interface MemorySearchCompletedEvent extends DreamXiEvent {
  readonly type: "memory.search.completed";
  readonly payload: {
    readonly playerId: PlayerId;
    readonly query: string;
    readonly resultCount: number;
    readonly durationMs: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 公平竞技事件
// ─────────────────────────────────────────────────────────────────────────────

/** 公平竞技违规检测事件 */
export interface FairPlayViolationDetectedEvent extends DreamXiEvent {
  readonly type: "fairplay.violation.detected";
  readonly payload: {
    readonly messageId: MessageId;
    readonly ruleId: string;
    readonly severity: "low" | "medium" | "high" | "critical";
    readonly description: string;
  };
}

/** 违规内容拦截事件 */
export interface FairPlayViolationBlockedEvent extends DreamXiEvent {
  readonly type: "fairplay.violation.blocked";
  readonly payload: {
    readonly messageId: MessageId;
    readonly ruleId: string;
    readonly blockedAt: "ingress" | "egress";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由事件
// ─────────────────────────────────────────────────────────────────────────────

/** 路由回退事件（意图推断失败，回退到 Leo） */
export interface RouterFallbackTriggeredEvent extends DreamXiEvent {
  readonly type: "router.fallback.triggered";
  readonly payload: {
    readonly messageId: MessageId;
    readonly reason: string;
    readonly fallbackPlayer: PlayerId;
  };
}

/** @mention 解析事件 */
export interface RouterMentionParsedEvent extends DreamXiEvent {
  readonly type: "router.mention.parsed";
  readonly payload: {
    readonly messageId: MessageId;
    readonly mentions: ReadonlyArray<PlayerId>;
    readonly rawText: string;
  };
}

/** 意图推断完成事件 */
export interface RouterIntentInferredEvent extends DreamXiEvent {
  readonly type: "router.intent.inferred";
  readonly payload: {
    readonly messageId: MessageId;
    readonly inferredPlayer: PlayerId;
    readonly confidence: number;
    readonly matchedKeywords: ReadonlyArray<string>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 系统事件
// ─────────────────────────────────────────────────────────────────────────────

/** 服务器启动成功事件 */
export interface SystemServerStartedEvent extends DreamXiEvent {
  readonly type: "system.server.started";
  readonly payload: {
    readonly port: number;
    readonly host: string;
    readonly nodeVersion: string;
    readonly memoryMode: boolean;
  };
}

/** 服务器停止事件 */
export interface SystemServerStoppedEvent extends DreamXiEvent {
  readonly type: "system.server.stopped";
  readonly payload: {
    readonly reason: "sigterm" | "sigint" | "error" | "manual";
    readonly uptimeMs: number;
  };
}

/** 配置加载成功事件 */
export interface SystemConfigLoadedEvent extends DreamXiEvent {
  readonly type: "system.config.loaded";
  readonly payload: {
    readonly configSource: string; // 配置文件路径或 "env"
    readonly playerCount: number;
    readonly tacticCount: number;
  };
}

/** 配置验证失败事件 */
export interface SystemConfigInvalidEvent extends DreamXiEvent {
  readonly type: "system.config.invalid";
  readonly payload: {
    readonly configSource: string;
    readonly errors: ReadonlyArray<string>;
  };
}

/** 健康检查触发事件 */
export interface SystemHealthCheckedEvent extends DreamXiEvent {
  readonly type: "system.health.checked";
  readonly payload: {
    readonly status: "ok" | "degraded" | "down";
    readonly uptimeMs: number;
    readonly memoryUsageBytes: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 联合类型（Discriminated Union）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 所有平台事件的联合类型。
 *
 * 可通过 `type` 字段安全地 narrow 到具体事件类型：
 *
 * @example
 * ```ts
 * function handleEvent(event: AnyDreamXiEvent) {
 *   if (event.type === "message.route.resolved") {
 *     // event 已被 narrow 为 MessageRouteResolvedEvent
 *     console.log(event.payload.targetPlayer);
 *   }
 * }
 * ```
 */
export type AnyDreamXiEvent =
  | MessageSendRequestedEvent
  | MessageRouteResolvedEvent
  | MessageDeliverStartedEvent
  | MessageDeliverCompletedEvent
  | MessageDeliverFailedEvent
  | MessageReplyReceivedEvent
  | ThreadCreatedEvent
  | ThreadStatusChangedEvent
  | MemoryWriteRequestedEvent
  | MemoryWriteCompletedEvent
  | MemoryWriteFailedEvent
  | MemoryEvictCompletedEvent
  | MemorySearchCompletedEvent
  | FairPlayViolationDetectedEvent
  | FairPlayViolationBlockedEvent
  | RouterFallbackTriggeredEvent
  | RouterMentionParsedEvent
  | RouterIntentInferredEvent
  | SystemServerStartedEvent
  | SystemServerStoppedEvent
  | SystemConfigLoadedEvent
  | SystemConfigInvalidEvent
  | SystemHealthCheckedEvent;

// ─────────────────────────────────────────────────────────────────────────────
// 事件总线接口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 事件订阅过滤器。
 * 支持精确类型匹配或通配符前缀过滤（如 `"message.*"`）。
 */
export interface EventFilter {
  /** 订阅的事件类型（支持通配符 "*" 匹配全部） */
  types: ReadonlyArray<EventType | "*">;
  /** 按来源球员过滤（可选） */
  source?: PlayerId | "coach" | "system";
}

/** 事件处理回调函数 */
export type EventHandler<T extends AnyDreamXiEvent = AnyDreamXiEvent> = (
  event: T
) => void | Promise<void>;

/** 事件订阅令牌（用于取消订阅） */
export interface EventSubscription {
  /** 订阅 ID */
  readonly id: string;
  /** 取消订阅 */
  unsubscribe(): void;
}

/**
 * 平台事件总线接口。
 *
 * 实现类（如 `InMemoryEventBus`）需满足：
 *   - `emit` 为异步操作，保证所有订阅者处理完毕后 resolve
 *   - `subscribe` 返回可取消的 `EventSubscription`
 *   - 订阅者抛出异常时不应影响其他订阅者
 *
 * @example
 * ```ts
 * const bus: EventBus = new InMemoryEventBus();
 *
 * const sub = bus.subscribe(
 *   { types: ["message.route.resolved"] },
 *   (event) => { console.log("路由到:", event.payload.targetPlayer); }
 * );
 *
 * // 取消订阅
 * sub.unsubscribe();
 * ```
 */
export interface EventBus {
  /**
   * 发布事件，异步通知所有匹配的订阅者。
   * @param event 要发布的事件
   */
  emit(event: AnyDreamXiEvent): Promise<void>;

  /**
   * 订阅事件。
   * @param filter 过滤条件
   * @param handler 事件处理函数
   * @returns 可取消的订阅令牌
   */
  subscribe<T extends AnyDreamXiEvent>(
    filter: EventFilter,
    handler: EventHandler<T>
  ): EventSubscription;

  /**
   * 订阅一次性事件（触发后自动取消订阅）。
   * @param filter 过滤条件
   * @param handler 事件处理函数
   * @returns 可取消的订阅令牌
   */
  once<T extends AnyDreamXiEvent>(
    filter: EventFilter,
    handler: EventHandler<T>
  ): EventSubscription;

  /**
   * 等待某个事件类型触发（Promise 风格）。
   * @param type 事件类型
   * @param timeoutMs 超时时间（毫秒），超时后 reject
   */
  waitFor<T extends AnyDreamXiEvent>(
    type: T["type"],
    timeoutMs?: number
  ): Promise<T>;

  /**
   * 获取所有已注册订阅者数量（调试用）。
   */
  subscriberCount(): number;

  /**
   * 清除所有订阅者（测试清理用）。
   */
  clear(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数类型
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建平台事件的工厂函数类型。
 *
 * @example
 * ```ts
 * const factory: EventFactory = createEventFactory({ source: "system" });
 * const event = factory.serverStarted({ port: 3000, host: "localhost", ... });
 * ```
 */
export interface EventFactory {
  serverStarted(
    payload: SystemServerStartedEvent["payload"]
  ): SystemServerStartedEvent;
  serverStopped(
    payload: SystemServerStoppedEvent["payload"]
  ): SystemServerStoppedEvent;
  configLoaded(
    payload: SystemConfigLoadedEvent["payload"]
  ): SystemConfigLoadedEvent;
  messageRouteResolved(
    payload: MessageRouteResolvedEvent["payload"]
  ): MessageRouteResolvedEvent;
  memoryWriteCompleted(
    payload: MemoryWriteCompletedEvent["payload"]
  ): MemoryWriteCompletedEvent;
  fairPlayViolationDetected(
    payload: FairPlayViolationDetectedEvent["payload"]
  ): FairPlayViolationDetectedEvent;
}

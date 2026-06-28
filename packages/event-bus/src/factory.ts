/**
 * @dream-xi/event-bus — 事件工厂（Event Factory）
 *
 * 提供类型安全的事件构造函数，自动填充 `id`、`timestamp`、`version` 字段。
 *
 * @example
 * ```ts
 * import { eventFactory } from "@dream-xi/event-bus/factory";
 *
 * const event = eventFactory.serverStarted({
 *   port: 3000,
 *   host: "0.0.0.0",
 *   nodeVersion: process.version,
 *   memoryMode: true,
 * });
 *
 * await bus.emit(event);
 * ```
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import type {
  EventId,
  EventVersion,
  FairPlayViolationDetectedEvent,
  MemoryEvictCompletedEvent,
  MemoryWriteCompletedEvent,
  MemoryWriteFailedEvent,
  MemoryWriteRequestedEvent,
  MessageDeliverCompletedEvent,
  MessageDeliverFailedEvent,
  MessageDeliverStartedEvent,
  MessageReplyReceivedEvent,
  MessageRouteResolvedEvent,
  MessageSendRequestedEvent,
  RouterFallbackTriggeredEvent,
  RouterIntentInferredEvent,
  RouterMentionParsedEvent,
  SystemConfigInvalidEvent,
  SystemConfigLoadedEvent,
  SystemHealthCheckedEvent,
  SystemServerStartedEvent,
  SystemServerStoppedEvent,
  ThreadCreatedEvent,
  ThreadStatusChangedEvent,
} from "@dream-xi/types";

// ─────────────────────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────────────────────

const VERSION: EventVersion = 1;

function makeId(): EventId {
  return randomUUID() as EventId;
}

function makeTimestamp(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 事件工厂对象
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 平台事件工厂。
 *
 * 每个方法只需传入业务 `payload`，
 * `id`、`timestamp`、`version` 自动生成。
 */
export const eventFactory = {
  // ── 消息事件 ──────────────────────────────────────────────────────────────

  messageSendRequested(
    payload: MessageSendRequestedEvent["payload"],
    source?: MessageSendRequestedEvent["source"],
  ): MessageSendRequestedEvent {
    return {
      id: makeId(),
      type: "message.send.requested",
      timestamp: makeTimestamp(),
      version: VERSION,
      source,
      payload,
    };
  },

  messageRouteResolved(
    payload: MessageRouteResolvedEvent["payload"],
    source?: MessageRouteResolvedEvent["source"],
  ): MessageRouteResolvedEvent {
    return {
      id: makeId(),
      type: "message.route.resolved",
      timestamp: makeTimestamp(),
      version: VERSION,
      source,
      payload,
    };
  },

  messageDeliverStarted(
    payload: MessageDeliverStartedEvent["payload"],
  ): MessageDeliverStartedEvent {
    return {
      id: makeId(),
      type: "message.deliver.started",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  messageDeliverCompleted(
    payload: MessageDeliverCompletedEvent["payload"],
  ): MessageDeliverCompletedEvent {
    return {
      id: makeId(),
      type: "message.deliver.completed",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  messageDeliverFailed(
    payload: MessageDeliverFailedEvent["payload"],
  ): MessageDeliverFailedEvent {
    return {
      id: makeId(),
      type: "message.deliver.failed",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  messageReplyReceived(
    payload: MessageReplyReceivedEvent["payload"],
    source?: MessageReplyReceivedEvent["source"],
  ): MessageReplyReceivedEvent {
    return {
      id: makeId(),
      type: "message.reply.received",
      timestamp: makeTimestamp(),
      version: VERSION,
      source,
      payload,
    };
  },

  // ── 线程事件 ──────────────────────────────────────────────────────────────

  threadCreated(
    payload: ThreadCreatedEvent["payload"],
  ): ThreadCreatedEvent {
    return {
      id: makeId(),
      type: "thread.created",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  threadStatusChanged(
    payload: ThreadStatusChangedEvent["payload"],
  ): ThreadStatusChangedEvent {
    return {
      id: makeId(),
      type: "thread.status.changed",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  // ── 记忆事件 ──────────────────────────────────────────────────────────────

  memoryWriteRequested(
    payload: MemoryWriteRequestedEvent["payload"],
  ): MemoryWriteRequestedEvent {
    return {
      id: makeId(),
      type: "memory.write.requested",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  memoryWriteCompleted(
    payload: MemoryWriteCompletedEvent["payload"],
  ): MemoryWriteCompletedEvent {
    return {
      id: makeId(),
      type: "memory.write.completed",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  memoryWriteFailed(
    payload: MemoryWriteFailedEvent["payload"],
  ): MemoryWriteFailedEvent {
    return {
      id: makeId(),
      type: "memory.write.failed",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  memoryEvictCompleted(
    payload: MemoryEvictCompletedEvent["payload"],
  ): MemoryEvictCompletedEvent {
    return {
      id: makeId(),
      type: "memory.evict.completed",
      timestamp: makeTimestamp(),
      version: VERSION,
      payload,
    };
  },

  // ── 路由事件 ──────────────────────────────────────────────────────────────

  routerFallbackTriggered(
    payload: RouterFallbackTriggeredEvent["payload"],
  ): RouterFallbackTriggeredEvent {
    return {
      id: makeId(),
      type: "router.fallback.triggered",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  routerMentionParsed(
    payload: RouterMentionParsedEvent["payload"],
  ): RouterMentionParsedEvent {
    return {
      id: makeId(),
      type: "router.mention.parsed",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  routerIntentInferred(
    payload: RouterIntentInferredEvent["payload"],
  ): RouterIntentInferredEvent {
    return {
      id: makeId(),
      type: "router.intent.inferred",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  // ── 公平竞技事件 ──────────────────────────────────────────────────────────

  fairPlayViolationDetected(
    payload: FairPlayViolationDetectedEvent["payload"],
  ): FairPlayViolationDetectedEvent {
    return {
      id: makeId(),
      type: "fairplay.violation.detected",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  // ── 系统事件 ──────────────────────────────────────────────────────────────

  serverStarted(
    payload: SystemServerStartedEvent["payload"],
  ): SystemServerStartedEvent {
    return {
      id: makeId(),
      type: "system.server.started",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  serverStopped(
    payload: SystemServerStoppedEvent["payload"],
  ): SystemServerStoppedEvent {
    return {
      id: makeId(),
      type: "system.server.stopped",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  configLoaded(
    payload: SystemConfigLoadedEvent["payload"],
  ): SystemConfigLoadedEvent {
    return {
      id: makeId(),
      type: "system.config.loaded",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  configInvalid(
    payload: SystemConfigInvalidEvent["payload"],
  ): SystemConfigInvalidEvent {
    return {
      id: makeId(),
      type: "system.config.invalid",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },

  healthChecked(
    payload: SystemHealthCheckedEvent["payload"],
  ): SystemHealthCheckedEvent {
    return {
      id: makeId(),
      type: "system.health.checked",
      timestamp: makeTimestamp(),
      version: VERSION,
      source: "system",
      payload,
    };
  },
} as const;

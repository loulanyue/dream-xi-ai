/**
 * @dream-xi/router — 消息路由器（Message Router）
 *
 * Dream XI A2A 消息路由的核心入口。
 *
 * 路由优先级（来自 docs/ARCHITECTURE.md § ADR-003）：
 *   1. 显式 @mention（最高优先级）
 *   2. 任务类型意图推断
 *   3. 默认路由 → Leo (#10 队长)
 *
 * 功能：
 *   - 解析 @mention
 *   - 意图推断（无 mention 时）
 *   - 确定最终路由目标
 *   - 构建结构化路由信息
 */

import type {
  ContentBlock,
  Message,
  MessageId,
  MessageKind,
  MessageRouting,
  MessageSource,
  PlayerId,
  TextBlock,
  ThreadId,
} from "@dream-xi/types";
import { parseMentions } from "./mention-parser.js";
import { inferIntent } from "./intent-inferrer.js";
import { ThreadManager } from "./thread-manager.js";

export { parseMentions, inferIntent, ThreadManager };
export type { MentionParseResult } from "./mention-parser.js";
export type { InferenceResult } from "./intent-inferrer.js";
export type { CreateThreadOptions, UpdateThreadOptions } from "./thread-manager.js";

// ─────────────────────────────────────────────────────────────────────────────
// 路由器配置
// ─────────────────────────────────────────────────────────────────────────────

/** 路由器配置选项 */
export interface RouterConfig {
  /**
   * 意图推断置信度阈值（低于此值则回退到默认路由）
   * @default 0.2
   */
  inferenceConfidenceThreshold?: number;
  /**
   * 默认路由目标（所有路由失败时的兜底球员）
   * @default "leo"
   */
  defaultPlayer?: PlayerId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由请求与结果
// ─────────────────────────────────────────────────────────────────────────────

/** 路由请求 */
export interface RouteRequest {
  /** 消息文本 */
  text: string;
  /** 所属线程 ID */
  threadId: ThreadId;
  /** 发送方 */
  senderId: PlayerId | "coach" | "system";
  /** 消息类型（默认 "chat"） */
  kind?: MessageKind;
  /** 消息来源（默认 "coach"） */
  source?: MessageSource;
  /** 额外内容块（代码、附件等） */
  extraBlocks?: ContentBlock[];
}

/** 路由结果 */
export interface RouteResult {
  /** 构建好的完整消息对象 */
  message: Message;
  /** 路由信息 */
  routing: MessageRouting;
  /** 路由方式 */
  routeMethod: "mention" | "inferred" | "default";
  /** 意图推断置信度（仅 inferred 时有值） */
  inferenceConfidence?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 消息路由器
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dream XI A2A 消息路由器
 *
 * @example
 * ```ts
 * const router = new MessageRouter();
 * const result = router.route({
 *   text: "@andre 帮我 review 一下这段代码",
 *   threadId: "thread-abc",
 *   senderId: "coach",
 * });
 * console.log(result.routing.resolvedTarget); // "andre"
 * console.log(result.routeMethod);            // "mention"
 * ```
 */
export class MessageRouter {
  private readonly config: Required<RouterConfig>;
  readonly threads: ThreadManager;

  constructor(config: RouterConfig = {}) {
    this.config = {
      inferenceConfidenceThreshold: config.inferenceConfidenceThreshold ?? 0.2,
      defaultPlayer: config.defaultPlayer ?? "leo",
    };
    this.threads = new ThreadManager();
  }

  /**
   * 路由一条消息
   *
   * 完整流程：
   * 1. 解析 @mention
   * 2. 若无 mention → 意图推断
   * 3. 若推断置信度不足 → 默认路由
   * 4. 构建消息对象并更新线程状态
   */
  route(request: RouteRequest): RouteResult {
    const { text, threadId, senderId, kind = "chat", source = "coach", extraBlocks = [] } = request;

    // 步骤 1：解析 @mention
    const { mentions, cleanedText } = parseMentions(text);

    let resolvedTarget: PlayerId;
    let routeMethod: RouteResult["routeMethod"];
    let inferenceConfidence: number | undefined;
    let inferredTarget: PlayerId | undefined;

    if (mentions.length > 0) {
      // 步骤 2a：有显式 @mention → 直接路由到第一个 mention 的球员
      resolvedTarget = mentions[0]!;
      routeMethod = "mention";
    } else {
      // 步骤 2b：无 @mention → 意图推断
      const inference = inferIntent(cleanedText);
      inferredTarget = inference.target;
      inferenceConfidence = inference.confidence;

      if (!inference.isDefault && inference.confidence >= this.config.inferenceConfidenceThreshold) {
        resolvedTarget = inference.target;
        routeMethod = "inferred";
      } else {
        // 步骤 3：推断置信度不足 → 默认路由
        resolvedTarget = this.config.defaultPlayer;
        routeMethod = "default";
      }
    }

    // 步骤 4：构建路由信息
    const routing: MessageRouting = {
      mentions,
      inferredTarget,
      resolvedTarget,
    };

    // 步骤 5：构建消息内容块
    const textBlock: TextBlock = { type: "text", text: cleanedText };
    const content: ContentBlock[] = [textBlock, ...extraBlocks];

    // 步骤 6：构建完整消息对象
    const message: Message = {
      id: generateMessageId(),
      threadId,
      kind,
      source,
      senderId,
      routing,
      content,
      createdAt: new Date(),
    };

    // 步骤 7：更新线程参与者和消息计数
    const thread = this.threads.get(threadId);
    if (thread !== undefined) {
      this.threads.addParticipant(threadId, resolvedTarget);
      this.threads.incrementMessageCount(threadId);
    }

    return {
      message,
      routing,
      routeMethod,
      ...(inferenceConfidence !== undefined && { inferenceConfidence }),
    };
  }

  /**
   * 快捷方法：创建新线程并路由消息
   */
  routeToNewThread(
    text: string,
    senderId: PlayerId | "coach",
    title?: string,
  ): RouteResult {
    const thread = this.threads.create({
      createdBy: senderId,
      title,
    });
    this.threads.setActive(thread.id);

    return this.route({ text, threadId: thread.id, senderId });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

/** 生成消息 ID */
function generateMessageId(): MessageId {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

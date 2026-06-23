/**
 * @dream-xi/types — A2A 消息（Message）类型定义
 *
 * 消息是球员之间传球的载体。Dream XI 使用结构化消息协议
 * 实现 @mention 路由、线程隔离和结构化交接。
 *
 * 参考：docs/SOP.md § 传球规则（A2A 通信）
 */

import type { PlayerId } from "./player.js";

// ─────────────────────────────────────────────────────────────────────────────
// 消息 ID 与线程 ID
// ─────────────────────────────────────────────────────────────────────────────

/** 消息唯一标识符（UUID v4） */
export type MessageId = string;

/** 线程（战术板）唯一标识符 */
export type ThreadId = string;

// ─────────────────────────────────────────────────────────────────────────────
// 消息来源（Message Source）
// ─────────────────────────────────────────────────────────────────────────────

/** 消息发送方类型 */
export type MessageSource =
  | "coach"   // 主教练（人类用户）
  | "player"  // 球员（AI Agent）
  | "system"; // 系统（平台层自动生成）

// ─────────────────────────────────────────────────────────────────────────────
// 消息类型（Message Kind）
// ─────────────────────────────────────────────────────────────────────────────

/** 消息类型 */
export type MessageKind =
  | "chat"        // 普通对话消息
  | "handoff"     // 结构化交接消息（Structured Handoff）
  | "review"      // 代码审查消息
  | "gate-check"  // 门禁检查结果
  | "system"      // 系统通知
  | "summary";    // 赛后总结

// ─────────────────────────────────────────────────────────────────────────────
// 消息内容块（Content Block）
// ─────────────────────────────────────────────────────────────────────────────

/** 文本内容块 */
export interface TextBlock {
  type: "text";
  text: string;
}

/** 代码块 */
export interface CodeBlock {
  type: "code";
  language: string;
  code: string;
  filename?: string;
}

/** 代码差异块 */
export interface DiffBlock {
  type: "diff";
  language: string;
  diff: string;
  filename: string;
}

/** 审查发现 */
export interface ReviewFinding {
  /** 发现等级：P1 红牌 / P2 黄牌 / P3 角球 */
  severity: "P1" | "P2" | "P3";
  /** 问题描述 */
  description: string;
  /** 相关文件（可选） */
  file?: string;
  /** 相关行号（可选） */
  line?: number;
  /** 建议的修复方案（可选） */
  suggestion?: string;
}

/** 审查内容块 */
export interface ReviewBlock {
  type: "review";
  findings: ReviewFinding[];
  /** 整体评分（0-100） */
  score?: number;
  /** 是否阻断合并（有 P1 发现时为 true） */
  blocking: boolean;
}

/** 结构化交接内容块（来自 docs/SOP.md） */
export interface HandoffBlock {
  type: "handoff";
  /** 当前状态 */
  currentStatus: string;
  /** 关键上下文 */
  context: string;
  /** 待办事项 */
  todos: string[];
  /** 参考文件或链接 */
  references?: string[];
}

/** 检查清单内容块 */
export interface ChecklistBlock {
  type: "checklist";
  items: Array<{
    label: string;
    checked: boolean;
  }>;
}

/** 所有内容块的联合类型 */
export type ContentBlock =
  | TextBlock
  | CodeBlock
  | DiffBlock
  | ReviewBlock
  | HandoffBlock
  | ChecklistBlock;

// ─────────────────────────────────────────────────────────────────────────────
// 消息路由（Message Routing）
// ─────────────────────────────────────────────────────────────────────────────

/** 消息路由信息 */
export interface MessageRouting {
  /** 显式 @mention 目标（优先级最高） */
  mentions: PlayerId[];
  /** 系统自动推断的路由目标 */
  inferredTarget?: PlayerId;
  /** 最终路由目标 */
  resolvedTarget: PlayerId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 消息（Message）
// ─────────────────────────────────────────────────────────────────────────────

/** Dream XI 消息实体 */
export interface Message {
  /** 消息唯一 ID */
  id: MessageId;
  /** 所属线程（战术板） */
  threadId: ThreadId;
  /** 消息类型 */
  kind: MessageKind;
  /** 发送方类型 */
  source: MessageSource;
  /** 发送方 ID（球员 ID 或 "coach"） */
  senderId: PlayerId | "coach" | "system";
  /** 路由信息 */
  routing: MessageRouting;
  /** 消息内容块列表（支持富文本混合） */
  content: ContentBlock[];
  /** 关联的消息 ID（回复时使用） */
  replyToId?: MessageId;
  /** 消息创建时间 */
  createdAt: Date;
  /** Token 消耗统计 */
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  /** 消息元数据 */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 线程（Thread / 战术板）
// ─────────────────────────────────────────────────────────────────────────────

/** 线程状态 */
export type ThreadStatus = "active" | "archived" | "paused";

/** 线程（战术板）实体 */
export interface Thread {
  /** 线程唯一 ID */
  id: ThreadId;
  /** 线程标题（可自动生成） */
  title: string;
  /** 线程状态 */
  status: ThreadStatus;
  /** 创建者 ID */
  createdBy: string;
  /** 参与球员列表 */
  participants: PlayerId[];
  /** 消息数量 */
  messageCount: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活动时间 */
  updatedAt: Date;
  /** 线程标签（可选，用于分类） */
  tags?: string[];
}

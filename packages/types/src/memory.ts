/**
 * @dream-xi/types — 记忆（Memory）类型定义
 *
 * Dream XI 的记忆系统分为三层：
 * - 工作记忆（Working Memory）：当前线程的完整上下文
 * - 情景记忆（Episodic Memory）：跨线程的决策摘要，存 Redis
 * - 语义记忆（Semantic Memory）：持久化的经验沉淀，以文档形式存储
 *
 * 参考：docs/ARCHITECTURE.md § ADR-002 持久身份策略
 */

import type { PlayerId } from "./player.js";
import type { ThreadId } from "./message.js";

// ─────────────────────────────────────────────────────────────────────────────
// 记忆 ID
// ─────────────────────────────────────────────────────────────────────────────

/** 记忆条目唯一标识符 */
export type MemoryId = string;

// ─────────────────────────────────────────────────────────────────────────────
// 记忆层级（Memory Layer）
// ─────────────────────────────────────────────────────────────────────────────

/** 记忆层级，对应三层记忆架构 */
export type MemoryLayer =
  | "working"   // 工作记忆：当前线程，完整上下文
  | "episodic"  // 情景记忆：跨线程摘要，Redis 存储
  | "semantic"; // 语义记忆：持久经验，Markdown 文档

// ─────────────────────────────────────────────────────────────────────────────
// 记忆条目（Memory Entry）
// ─────────────────────────────────────────────────────────────────────────────

/** 记忆条目 — 通用基础类型 */
export interface MemoryEntry {
  /** 记忆唯一 ID */
  id: MemoryId;
  /** 记忆层级 */
  layer: MemoryLayer;
  /** 记忆所属球员 */
  playerId: PlayerId;
  /** 关联线程 ID（工作记忆专属） */
  threadId?: ThreadId;
  /** 记忆内容 */
  content: string;
  /** 重要性评分（0-1，影响记忆保留优先级） */
  importance: number;
  /** 创建时间 */
  createdAt: Date;
  /** 过期时间（null 表示永不过期） */
  expiresAt: Date | null;
  /** 标签（用于语义检索） */
  tags: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 情景记忆条目（Episodic Memory Entry）
// ─────────────────────────────────────────────────────────────────────────────

/** 情景记忆 — 跨线程的决策摘要 */
export interface EpisodicMemoryEntry extends MemoryEntry {
  layer: "episodic";
  /** 对应的源线程 ID */
  sourceThreadId: ThreadId;
  /** 线程标题摘要 */
  threadSummary: string;
  /** 关键决策列表 */
  keyDecisions: string[];
  /** 学到的经验 */
  lessonsLearned: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 语义记忆条目（Semantic Memory Entry）
// ─────────────────────────────────────────────────────────────────────────────

/** 语义记忆 — 持久化的经验文档 */
export interface SemanticMemoryEntry extends MemoryEntry {
  layer: "semantic";
  /** 文档标题 */
  title: string;
  /** 适用场景 */
  applicableScenarios: string[];
  /** 相关技能标签 */
  relatedTactics: string[];
  /** 引用次数（越高越重要） */
  referenceCount: number;
  /** 最后引用时间 */
  lastReferencedAt: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 球员身份锚定（Identity Anchor）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 球员身份锚定卡
 *
 * 每次请求头部注入的精简角色卡（< 200 tokens），
 * 防止上下文压缩导致球员"失忆"。
 *
 * 参考：docs/ARCHITECTURE.md § ADR-002
 */
export interface IdentityAnchor {
  /** 球员 ID */
  playerId: PlayerId;
  /** 当前球衣号码和名字 */
  identity: string;
  /** 核心职责（一句话） */
  coreRole: string;
  /** 性格关键词（3-5 个） */
  personalityKeywords: string[];
  /** 球队铁律摘要（4 条，始终注入） */
  fairPlayRules: [string, string, string, string];
  /** 当前加载的战术（简短列表） */
  activeTactics: string[];
  /** 锚定卡版本（用于失效检测） */
  version: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 记忆配置（Memory Config）
// ─────────────────────────────────────────────────────────────────────────────

/** 记忆系统配置 */
export interface MemoryConfig {
  /** 存储后端 */
  backend: "redis" | "memory";
  /** Redis 连接 URL（backend 为 redis 时必填） */
  redisUrl?: string;
  /** 工作记忆最大 Token 数（超过触发自动压缩） */
  workingMemoryMaxTokens: number;
  /** 情景记忆 TTL（秒，默认 30 天） */
  episodicMemoryTtlSeconds: number;
  /** 语义记忆存储路径 */
  semanticMemoryPath: string;
  /** 身份锚定注入频率（每 N 条消息注入一次） */
  identityAnchorInterval: number;
}

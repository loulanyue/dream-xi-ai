/**
 * @dream-xi/server — 请求/响应类型定义
 *
 * 所有 HTTP API 的请求体和响应体类型。
 * 遵循 Dream XI 足球主题命名风格。
 */

import type { PlayerId, ThreadId } from "@dream-xi/types";

// ─────────────────────────────────────────────────────────────────────────────
// 通用响应包装
// ─────────────────────────────────────────────────────────────────────────────

/** 标准 API 响应包装器 */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
    version: string;
  };
}

/** 分页响应 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 健康检查（GET /health）
// ─────────────────────────────────────────────────────────────────────────────

/** 健康检查响应 */
export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  version: string;
  timestamp: string;
  services: {
    memory: "ok" | "error";
    router: "ok" | "error";
    fairPlay: "ok" | "error";
  };
  players: Array<{
    id: PlayerId;
    status: "active" | "benched";
    provider: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 聊天 API（POST /api/chat）
// ─────────────────────────────────────────────────────────────────────────────

/** 聊天请求体 */
export interface ChatRequest {
  /** 消息文本（支持 @mention 语法） */
  message: string;
  /** 线程 ID（不传则自动创建新线程） */
  threadId?: ThreadId;
  /** 强制路由到指定球员（覆盖 @mention 和意图推断） */
  playerId?: PlayerId;
  /** 附加选项 */
  options?: {
    /** 是否流式响应（默认 false） */
    stream?: boolean;
    /** 强制加载的战术列表 */
    tactics?: string[];
  };
}

/** 聊天响应体 */
export interface ChatResponse {
  /** 消息 ID */
  messageId: string;
  /** 线程 ID */
  threadId: ThreadId;
  /** 处理消息的球员 */
  handledBy: PlayerId;
  /** 路由方式 */
  routeMethod: "mention" | "inferred" | "default" | "forced";
  /** 球员回复内容 */
  reply: string;
  /** Token 消耗 */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  /** 已加载的战术 */
  loadedTactics: string[];
  /** 是否触发了记忆压缩 */
  memoryCompressed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 线程 API（GET/POST /api/threads）
// ─────────────────────────────────────────────────────────────────────────────

/** 创建线程请求 */
export interface CreateThreadRequest {
  title?: string;
  tags?: string[];
}

/** 线程摘要（列表项） */
export interface ThreadSummary {
  id: ThreadId;
  title: string;
  status: string;
  messageCount: number;
  participants: PlayerId[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 球员 API（GET /api/players）
// ─────────────────────────────────────────────────────────────────────────────

/** 球员状态响应 */
export interface PlayerStatusResponse {
  id: PlayerId;
  number: number;
  nameZh: string;
  nameEn: string;
  position: string;
  provider: string;
  status: "active" | "benched" | "busy" | "offline";
  tokenUsage?: {
    used: number;
    limit: number;
    ratio: number;
  };
  loadedTactics: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 记忆 API（GET /api/memory/:playerId）
// ─────────────────────────────────────────────────────────────────────────────

/** 记忆查询响应 */
export interface MemoryQueryResponse {
  playerId: PlayerId;
  episodicCount: number;
  memories: Array<{
    id: string;
    summary: string;
    keyDecisions: string[];
    importance: number;
    createdAt: string;
    tags: string[];
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 球队铁律 API（GET /api/fair-play/stats）
// ─────────────────────────────────────────────────────────────────────────────

/** 铁律统计响应 */
export interface FairPlayStatsResponse {
  totalChecks: number;
  blockedCount: number;
  warnCount: number;
  allowedCount: number;
  violationsByRule: Record<string, number>;
  recentViolations: Array<{
    timestamp: string;
    playerId: PlayerId;
    actionType: string;
    target: string;
    ruleId: string;
    severity: string;
  }>;
}

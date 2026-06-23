/**
 * @dream-xi/types — 战术（Tactic / Skill）类型定义
 *
 * 战术是球员按需加载的专项能力模块。
 * 每种战术定义了触发条件、注入的系统提示和适用球员。
 *
 * 参考：docs/ARCHITECTURE.md § ADR-001（战术手册框架）
 * 参考：docs/TIPS.md § 战术加载
 */

import type { PlayerId, PlayerPosition } from "./player.js";

// ─────────────────────────────────────────────────────────────────────────────
// 战术 ID 与版本
// ─────────────────────────────────────────────────────────────────────────────

/** 战术唯一标识符（kebab-case） */
export type TacticId = string;

/** 语义版本号 */
export type SemVer = `${number}.${number}.${number}`;

// ─────────────────────────────────────────────────────────────────────────────
// 战术分类（Tactic Category）
// ─────────────────────────────────────────────────────────────────────────────

/** 战术分类 */
export type TacticCategory =
  | "development"   // 开发战术：TDD、重构、性能优化
  | "review"        // 审查战术：代码审查、安全审查、架构审查
  | "design"        // 设计战术：UI 设计、系统设计、API 设计
  | "debugging"     // 调试战术：错误诊断、性能分析
  | "documentation" // 文档战术：技术写作、API 文档
  | "collaboration" // 协作战术：需求分析、技术评审
  | "ops";          // 运维战术：部署、监控、故障处理

// ─────────────────────────────────────────────────────────────────────────────
// 战术触发条件（Trigger）
// ─────────────────────────────────────────────────────────────────────────────

/** 战术触发条件 */
export interface TacticTrigger {
  /** 关键词触发（任意一个命中即触发） */
  keywords?: string[];
  /** 显式请求触发（用户手动指定战术名称） */
  explicit?: boolean;
  /** 任务类型触发 */
  taskTypes?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 战术定义（Tactic Definition）
// ─────────────────────────────────────────────────────────────────────────────

/** 战术定义 */
export interface TacticDefinition {
  /** 战术唯一 ID */
  id: TacticId;
  /** 战术名称 */
  name: string;
  /** 战术描述 */
  description: string;
  /** 战术版本 */
  version: SemVer;
  /** 战术分类 */
  category: TacticCategory;
  /** 适用球员位置（空数组表示所有球员） */
  applicablePositions: PlayerPosition[];
  /** 推荐球员（最适合执行此战术的球员） */
  preferredPlayer?: PlayerId;
  /** 触发条件 */
  trigger: TacticTrigger;
  /**
   * 战术系统提示（注入到球员上下文的额外指令）
   * 使用 Markdown 格式，建议 < 500 tokens
   */
  systemPrompt: string;
  /** 前置战术（加载本战术前必须先加载的战术） */
  requires?: TacticId[];
  /** 互斥战术（同一球员不能同时加载的战术） */
  conflicts?: TacticId[];
  /** 预计额外 Token 消耗（用于容量规划） */
  estimatedTokenOverhead: number;
  /** 作者 */
  author: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// 战术加载状态（Tactic Load State）
// ─────────────────────────────────────────────────────────────────────────────

/** 战术在球员上的加载状态 */
export interface TacticLoadState {
  tacticId: TacticId;
  playerId: PlayerId;
  /** 加载方式 */
  loadedBy: "auto" | "explicit";
  /** 加载时间 */
  loadedAt: Date;
  /** 是否活跃（球员当前正在使用此战术） */
  active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内置战术预设（Built-in Tactics）
// ─────────────────────────────────────────────────────────────────────────────

/** 内置战术 ID 枚举，方便类型安全引用 */
export const BUILTIN_TACTIC_IDS = {
  /** 测试驱动开发 */
  TDD: "tdd" as TacticId,
  /** 代码审查（跨位置） */
  CODE_REVIEW: "code-review" as TacticId,
  /** 安全审查 */
  SECURITY_REVIEW: "security-review" as TacticId,
  /** 架构设计 */
  ARCHITECTURE_DESIGN: "architecture-design" as TacticId,
  /** 快速原型 */
  RAPID_PROTOTYPE: "rapid-prototype" as TacticId,
  /** 调试助手 */
  DEBUG_ASSIST: "debug-assist" as TacticId,
  /** 技术文档写作 */
  TECH_WRITING: "tech-writing" as TacticId,
  /** 赛后复盘 */
  POST_MATCH_REVIEW: "post-match-review" as TacticId,
} as const;

export type BuiltinTacticId = (typeof BUILTIN_TACTIC_IDS)[keyof typeof BUILTIN_TACTIC_IDS];

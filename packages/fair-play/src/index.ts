/**
 * @dream-xi/fair-play — 球队铁律守卫（Fair Play Guard）入口
 *
 * 双重执行机制（代码层）的核心守卫类。
 * 在 Agent 执行任何危险操作前调用 guard.check() 进行拦截。
 *
 * 参考：docs/ARCHITECTURE.md § ADR-005
 */

export { FAIR_PLAY_RULES } from "./rules.js";
export type { FairPlayRule, RuleId, ViolationSeverity } from "./rules.js";

export { checkAction } from "./action-checker.js";
export type {
  ActionIntent,
  ActionType,
  Violation,
  CheckResult,
} from "./action-checker.js";

import type { FairPlayConfig } from "@dream-xi/types";
import { type ActionIntent, type CheckResult, checkAction } from "./action-checker.js";

// ─────────────────────────────────────────────────────────────────────────────
// 违规错误
// ─────────────────────────────────────────────────────────────────────────────

/** 球队铁律违规异常（block 级别违规时抛出） */
export class FairPlayViolationError extends Error {
  readonly violations: CheckResult["violations"];

  constructor(result: CheckResult) {
    super(result.rejectionMessage ?? "球队铁律违规");
    this.name = "FairPlayViolationError";
    this.violations = result.violations;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 球队铁律守卫（主入口）
// ─────────────────────────────────────────────────────────────────────────────

/** 审计日志条目 */
export interface AuditLogEntry {
  timestamp: Date;
  intent: ActionIntent;
  result: CheckResult;
}

/**
 * 球队铁律守卫
 *
 * 包裹在所有危险操作的执行前，提供统一的安全检查和审计日志。
 *
 * @example
 * ```ts
 * const guard = new FairPlayGuard(config.fairPlay);
 *
 * // 方式 1：检查并决策（不抛出）
 * const result = guard.check({
 *   playerId: "leo",
 *   type: "command-execute",
 *   target: "rm -rf ./data",
 * });
 * if (!result.allowed) {
 *   console.error(result.rejectionMessage);
 *   return;
 * }
 *
 * // 方式 2：直接守卫（自动抛出 FairPlayViolationError）
 * guard.enforce({
 *   playerId: "andre",
 *   type: "file-delete",
 *   target: "/app/data/users.db",
 * });
 *
 * // 方式 3：包裹异步操作
 * const data = await guard.wrap(
 *   { playerId: "flash", type: "network-request", target: "http://localhost:9999/admin" },
 *   () => fetch("http://localhost:9999/admin"),
 * );
 * ```
 */
export class FairPlayGuard {
  private readonly config: FairPlayConfig;
  private readonly auditLog: AuditLogEntry[] = [];

  constructor(config: FairPlayConfig) {
    this.config = config;
  }

  /**
   * 检查操作是否合规（不抛出，返回结果）
   */
  check(intent: ActionIntent): CheckResult {
    const result = checkAction(intent, this.config);

    // 记录审计日志
    this.auditLog.push({ timestamp: new Date(), intent, result });

    // 打印警告
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.warn(`⚠️  [FairPlay:${w.ruleId}] ${w.message} | ${intent.playerId}`);
      }
    }

    return result;
  }

  /**
   * 强制执行（block 级别违规时抛出 FairPlayViolationError）
   */
  enforce(intent: ActionIntent): void {
    const result = this.check(intent);
    if (!result.allowed) {
      throw new FairPlayViolationError(result);
    }
  }

  /**
   * 包裹异步操作（先检查，再执行）
   *
   * @param intent 操作意图
   * @param action 要执行的异步操作
   * @returns 操作结果
   * @throws FairPlayViolationError 如果操作违规
   */
  async wrap<T>(intent: ActionIntent, action: () => Promise<T>): Promise<T> {
    this.enforce(intent);
    return action();
  }

  /**
   * 包裹同步操作
   */
  wrapSync<T>(intent: ActionIntent, action: () => T): T {
    this.enforce(intent);
    return action();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 审计日志
  // ─────────────────────────────────────────────────────────────────────────

  /** 获取完整审计日志 */
  getAuditLog(): readonly AuditLogEntry[] {
    return this.auditLog;
  }

  /** 获取仅包含违规记录的审计日志 */
  getViolationLog(): AuditLogEntry[] {
    return this.auditLog.filter((e) => e.result.violations.length > 0);
  }

  /** 获取仅包含被拒绝操作的审计日志 */
  getBlockedLog(): AuditLogEntry[] {
    return this.auditLog.filter((e) => !e.result.allowed);
  }

  /** 清空审计日志（测试用） */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /** 获取统计摘要 */
  getStats(): {
    totalChecks: number;
    blockedCount: number;
    warnCount: number;
    allowedCount: number;
    violationsByRule: Record<string, number>;
  } {
    const violationsByRule: Record<string, number> = {};
    let blockedCount = 0;
    let warnCount = 0;

    for (const entry of this.auditLog) {
      if (!entry.result.allowed) blockedCount++;
      if (entry.result.warnings.length > 0) warnCount++;
      for (const v of entry.result.violations) {
        violationsByRule[v.ruleId] = (violationsByRule[v.ruleId] ?? 0) + 1;
      }
    }

    return {
      totalChecks: this.auditLog.length,
      blockedCount,
      warnCount,
      allowedCount: this.auditLog.length - blockedCount,
      violationsByRule,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 默认配置工厂
// ─────────────────────────────────────────────────────────────────────────────

/** 创建启用所有规则的默认守卫（生产环境推荐） */
export function createStrictGuard(): FairPlayGuard {
  return new FairPlayGuard({
    protectPersistentData: true,
    protectParentProcess: true,
    enforceReadOnlyConfig: true,
    enforcePortBoundaries: true,
    allowedPorts: [3003, 3004], // Dream XI 默认端口
  });
}

/** 创建宽松守卫（开发/测试环境，只 warn 不 block） */
export function createLenientGuard(): FairPlayGuard {
  return new FairPlayGuard({
    protectPersistentData: false,
    protectParentProcess: true, // 进程安全始终开启
    enforceReadOnlyConfig: false,
    enforcePortBoundaries: false,
    allowedPorts: [],
  });
}

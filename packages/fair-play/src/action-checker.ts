/**
 * @dream-xi/fair-play — 操作检查器（Action Checker）
 *
 * 在 Agent 执行危险操作前，检查其是否违反球队铁律。
 * 采用意图模式匹配（intent pattern matching）识别违规行为。
 *
 * 参考：docs/ARCHITECTURE.md § ADR-005（双重执行机制：提示层 + 代码层）
 */

import type { FairPlayConfig, PlayerId } from "@dream-xi/types";
import { FAIR_PLAY_RULES, type RuleId, type ViolationSeverity } from "./rules.js";

// ─────────────────────────────────────────────────────────────────────────────
// 操作意图（Action Intent）
// ─────────────────────────────────────────────────────────────────────────────

/** 球员打算执行的操作 */
export interface ActionIntent {
  /** 球员 ID */
  playerId: PlayerId;
  /** 操作类型 */
  type: ActionType;
  /** 操作目标（路径、命令、URL 等） */
  target: string;
  /** 操作描述 */
  description?: string;
}

/** 操作类型 */
export type ActionType =
  | "file-delete" // 删除文件或目录
  | "file-write" // 写文件（包括配置文件）
  | "command-execute" // 执行 shell 命令
  | "process-signal" // 发送进程信号
  | "network-request" // 网络请求
  | "db-operation" // 数据库操作
  | "redis-operation"; // Redis 操作

// ─────────────────────────────────────────────────────────────────────────────
// 检查结果
// ─────────────────────────────────────────────────────────────────────────────

/** 单条违规 */
export interface Violation {
  ruleId: RuleId;
  severity: ViolationSeverity;
  message: string;
  /** 铁律口号 */
  motto: string;
}

/** 操作检查结果 */
export interface CheckResult {
  /** 是否允许执行（有 block 级别违规时为 false） */
  allowed: boolean;
  /** 所有违规列表 */
  violations: Violation[];
  /** 警告列表（warn 级别） */
  warnings: Violation[];
  /** 格式化的拒绝原因（供日志和球员感知） */
  rejectionMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 违规检测规则（Pattern Matchers）
// ─────────────────────────────────────────────────────────────────────────────

/** 检测函数：返回 true 表示此操作触发了该铁律 */
type DetectorFn = (intent: ActionIntent, config: FairPlayConfig) => boolean;

/**
 * 数据圣殿检测
 * 识别可能删除持久化数据的操作
 */
const detectDataSanctuary: DetectorFn = (intent, config) => {
  if (!config.protectPersistentData) return false;

  const target = intent.target.toLowerCase();

  // 文件删除操作：检查目标路径
  if (intent.type === "file-delete") {
    const dangerousPaths = ["/data/", "./data/", ".sqlite", ".db", ".rdb", "dump.sql", "backup"];
    return dangerousPaths.some((p) => target.includes(p));
  }

  // 命令执行：检查危险命令
  if (intent.type === "command-execute") {
    const dangerousCommands = [
      "rm -rf",
      "drop table",
      "drop database",
      "truncate",
      "delete from",
      "flushall",
      "flushdb",
      "redis-cli flushall",
    ];
    return dangerousCommands.some((cmd) => target.toLowerCase().includes(cmd));
  }

  // Redis 操作：FLUSHALL / FLUSHDB
  if (intent.type === "redis-operation") {
    return /flush(all|db)/i.test(target);
  }

  // 数据库操作：DROP / TRUNCATE
  if (intent.type === "db-operation") {
    return /drop\s+(table|database|schema)|truncate\s+table/i.test(target);
  }

  return false;
};

/**
 * 进程自保检测
 * 识别可能杀死进程或触发重启的操作
 */
const detectProcessSafety: DetectorFn = (intent, config) => {
  if (!config.protectParentProcess) return false;

  if (intent.type === "process-signal") {
    return /kill|sigterm|sigkill|sigint/i.test(intent.target);
  }

  if (intent.type === "command-execute") {
    const dangerous = [
      "kill -9",
      "killall",
      "pkill",
      "pm2 kill",
      "pm2 delete all",
      "shutdown",
      "reboot",
      "halt",
      "systemctl stop",
      "service stop",
    ];
    return dangerous.some((cmd) => intent.target.toLowerCase().includes(cmd));
  }

  return false;
};

/**
 * 配置只读检测
 * 识别可能修改运行时配置文件的操作
 */
const detectConfigReadonly: DetectorFn = (intent, config) => {
  if (!config.enforceReadOnlyConfig) return false;

  if (intent.type !== "file-write") return false;

  const configFiles = [
    ".env",
    "biome.json",
    "tsconfig.json",
    "package.json",
    "pnpm-workspace.yaml",
    "docker-compose",
    "nginx.conf",
    ".github/workflows",
  ];

  const target = intent.target.toLowerCase();
  return configFiles.some((f) => target.includes(f));
};

/**
 * 端口边界检测
 * 识别跨越服务边界的网络请求
 */
const detectPortBoundary: DetectorFn = (intent, config) => {
  if (!config.enforcePortBoundaries) return false;
  if (intent.type !== "network-request") return false;

  // 提取目标 URL 中的端口号
  const portMatch = intent.target.match(/:(\d+)/);
  if (portMatch === null || portMatch[1] === undefined) return false;

  const port = Number.parseInt(portMatch[1], 10);
  return !config.allowedPorts.includes(port);
};

// ─────────────────────────────────────────────────────────────────────────────
// 检查器（Checker）
// ─────────────────────────────────────────────────────────────────────────────

const DETECTORS: Array<{ ruleId: RuleId; detect: DetectorFn }> = [
  { ruleId: "data-sanctuary", detect: detectDataSanctuary },
  { ruleId: "process-safety", detect: detectProcessSafety },
  { ruleId: "config-readonly", detect: detectConfigReadonly },
  { ruleId: "port-boundary", detect: detectPortBoundary },
];

/**
 * 检查操作意图是否违反球队铁律
 *
 * @example
 * ```ts
 * const result = checkAction(
 *   { playerId: "leo", type: "command-execute", target: "rm -rf ./data" },
 *   config.fairPlay,
 * );
 *
 * if (!result.allowed) {
 *   throw new FairPlayViolationError(result.rejectionMessage!);
 * }
 * ```
 */
export function checkAction(intent: ActionIntent, config: FairPlayConfig): CheckResult {
  const violations: Violation[] = [];

  for (const { ruleId, detect } of DETECTORS) {
    if (detect(intent, config)) {
      const rule = FAIR_PLAY_RULES[ruleId];
      violations.push({
        ruleId,
        severity: rule.severity,
        message: `[${rule.nameZh}] ${rule.description}`,
        motto: rule.motto,
      });
    }
  }

  const blockers = violations.filter((v) => v.severity === "block");
  const warnings = violations.filter((v) => v.severity === "warn");
  const allowed = blockers.length === 0;

  let rejectionMessage: string | undefined;
  if (!allowed) {
    const lines = blockers.map((v) => `⛔ ${v.message}\n   「${v.motto}」`);
    rejectionMessage = [
      "🟥 球队铁律违规 — 操作被拒绝",
      `球员：${intent.playerId} | 操作：${intent.type} → ${intent.target}`,
      "",
      ...lines,
    ].join("\n");
  }

  return {
    allowed,
    violations,
    warnings,
    ...(rejectionMessage !== undefined ? { rejectionMessage } : {}),
  };
}

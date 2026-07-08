/**
 * @dream-xi/server — 球队铁律统计路由
 *
 * GET /api/fair-play/stats — 守卫统计（检查次数、拦截次数、违规分布）
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerContext } from "../index.js";
import { sendJson } from "../middleware/index.js";
import type { FairPlayStatsResponse } from "../types.js";

/**
 * GET /api/fair-play/stats
 */
export function handleFairPlayStats(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
  requestId: string,
): void {
  const stats = ctx.guard.getStats();
  const violationLog = ctx.guard.getViolationLog();

  // 取最近 10 条违规记录
  const recentViolations = violationLog.slice(-10).map((entry) => ({
    timestamp: entry.timestamp.toISOString(),
    playerId: entry.intent.playerId,
    actionType: entry.intent.type,
    target: entry.intent.target,
    ruleId: entry.result.violations[0]?.ruleId ?? "unknown",
    severity: entry.result.violations[0]?.severity ?? "unknown",
  }));

  const response: FairPlayStatsResponse = {
    totalChecks: stats.totalChecks,
    blockedCount: stats.blockedCount,
    warnCount: stats.warnCount,
    allowedCount: stats.allowedCount,
    violationsByRule: stats.violationsByRule,
    recentViolations: recentViolations as FairPlayStatsResponse["recentViolations"],
  };

  sendJson(res, response, 200, requestId);
}

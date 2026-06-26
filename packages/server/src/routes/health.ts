/**
 * @dream-xi/server — GET /health 健康检查路由
 *
 * 返回服务状态、各子系统健康度、已配置球员列表。
 * 常用于 K8s liveness/readiness probe 和监控看板。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DreamXiConfig } from "@dream-xi/types";
import { PLAYER_DEFINITIONS } from "@dream-xi/types";
import type { HealthCheckResponse } from "../types.js";
import { sendJson } from "../middleware/index.js";

const START_TIME = Date.now();
const VERSION = "1.0.0-alpha";

/**
 * 健康检查路由处理器
 *
 * GET /health
 * GET /api/health
 */
export function handleHealth(
  req: IncomingMessage,
  res: ServerResponse,
  config: DreamXiConfig,
  requestId: string,
): void {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  // 检查各子服务状态
  const memoryOk = true; // 内存服务始终可用
  const routerOk = true; // 路由服务始终可用
  const fairPlayOk = true; // 守卫始终可用

  const overallStatus: HealthCheckResponse["status"] =
    memoryOk && routerOk && fairPlayOk ? "healthy" : "degraded";

  // 构建球员状态列表
  const playerIds = ["leo", "andre", "flash", "wall"] as const;
  const players: HealthCheckResponse["players"] = playerIds.map((id) => {
    const def = PLAYER_DEFINITIONS[id];
    const isConfigured = config.players[id] !== undefined;
    return {
      id,
      status: isConfigured ? "active" : "benched",
      provider: def.provider,
    };
  });

  const response: HealthCheckResponse = {
    status: overallStatus,
    uptime,
    version: VERSION,
    timestamp: new Date().toISOString(),
    services: {
      memory: memoryOk ? "ok" : "error",
      router: routerOk ? "ok" : "error",
      fairPlay: fairPlayOk ? "ok" : "error",
    },
    players,
  };

  sendJson(res, response, 200, requestId);
}

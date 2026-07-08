/**
 * @dream-xi/server — 球员状态路由
 *
 * GET /api/players        — 获取所有球员状态
 * GET /api/players/:id    — 获取单名球员状态
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DreamXiConfig, PlayerId } from "@dream-xi/types";
import { PLAYER_DEFINITIONS } from "@dream-xi/types";
import { sendError, sendJson } from "../middleware/index.js";
import type { PlayerStatusResponse } from "../types.js";

const PLAYER_IDS: PlayerId[] = ["leo", "andre", "flash", "wall", "gate"];

/**
 * GET /api/players — 获取所有球员状态
 */
export function handleGetPlayers(
  _req: IncomingMessage,
  res: ServerResponse,
  config: DreamXiConfig,
  requestId: string,
): void {
  const players: PlayerStatusResponse[] = PLAYER_IDS.map((id) => buildPlayerStatus(id, config));
  sendJson(res, players, 200, requestId);
}

/**
 * GET /api/players/:id — 获取单名球员状态
 */
export function handleGetPlayer(
  _req: IncomingMessage,
  res: ServerResponse,
  config: DreamXiConfig,
  playerId: string,
  requestId: string,
): void {
  if (!PLAYER_IDS.includes(playerId as PlayerId)) {
    sendError(res, 404, "PLAYER_NOT_FOUND", `球员不存在：${playerId}`, requestId);
    return;
  }

  const status = buildPlayerStatus(playerId as PlayerId, config);
  sendJson(res, status, 200, requestId);
}

/** 构建球员状态对象 */
function buildPlayerStatus(id: PlayerId, config: DreamXiConfig): PlayerStatusResponse {
  const def = PLAYER_DEFINITIONS[id];
  const playerConfig = config.players[id];
  const isConfigured = playerConfig !== undefined;

  return {
    id,
    number: def.number,
    nameZh: def.nameZh,
    nameEn: def.nameEn,
    position: def.position,
    provider: def.provider,
    status: isConfigured ? "active" : "benched",
    loadedTactics: [], // 运行时由 PlayerTacticSlot 填充
  };
}

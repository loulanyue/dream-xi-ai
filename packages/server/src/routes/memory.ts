/**
 * @dream-xi/server — 记忆查询路由
 *
 * GET /api/memory/:playerId — 查询球员的情景记忆列表
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { PlayerId } from "@dream-xi/types";
import type { ServerContext } from "../index.js";
import type { MemoryQueryResponse } from "../types.js";
import { sendJson, sendError } from "../middleware/index.js";

const VALID_PLAYERS: PlayerId[] = ["leo", "andre", "flash", "wall", "gate"];

/**
 * GET /api/memory/:playerId
 */
export async function handleGetMemory(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
  playerId: string,
  requestId: string,
): Promise<void> {
  if (!VALID_PLAYERS.includes(playerId as PlayerId)) {
    sendError(res, 404, "PLAYER_NOT_FOUND", `球员不存在：${playerId}`, requestId);
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
  const minImportance = parseFloat(url.searchParams.get("minImportance") ?? "0");

  const memories = await ctx.memory.queryEpisodic({
    playerId: playerId as PlayerId,
    limit: isNaN(limit) ? 10 : limit,
    minImportance: isNaN(minImportance) ? 0 : minImportance,
  });

  const response: MemoryQueryResponse = {
    playerId: playerId as PlayerId,
    episodicCount: memories.length,
    memories: memories.map((m) => ({
      id: m.id,
      summary: m.threadSummary,
      keyDecisions: m.keyDecisions,
      importance: m.importance,
      createdAt: new Date(m.createdAt).toISOString(),
      tags: m.tags,
    })),
  };

  sendJson(res, response, 200, requestId);
}

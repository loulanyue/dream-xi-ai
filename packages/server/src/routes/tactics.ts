/**
 * @dream-xi/server — GET /api/tactics 战术查询路由
 *
 * GET /api/tactics                — 列出所有可用战术
 * GET /api/tactics/:id            — 获取单条战术详情
 * GET /api/tactics/search?q=tdd   — 按关键词搜索战术
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { TacticDefinition } from "@dream-xi/types";
import type { ServerContext } from "../index.js";
import { sendError, sendJson } from "../middleware/index.js";

/** 对外暴露的战术摘要（省略完整 systemPrompt） */
export interface TacticSummary {
  id: string;
  name: string;
  description: string;
  category: TacticDefinition["category"];
  applicablePositions: TacticDefinition["applicablePositions"];
  preferredPlayer?: string;
  conflicts: string[];
  estimatedTokenOverhead: number;
  triggerKeywords: string[];
}

/** 将完整 TacticDefinition 转为对外摘要（不暴露系统提示） */
function toSummary(t: TacticDefinition): TacticSummary {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    applicablePositions: t.applicablePositions,
    conflicts: t.conflicts ?? [],
    estimatedTokenOverhead: t.estimatedTokenOverhead,
    triggerKeywords: t.trigger.keywords ?? [],
    ...(t.preferredPlayer !== undefined ? { preferredPlayer: t.preferredPlayer } : {}),
  };
}

/**
 * GET /api/tactics
 * GET /api/tactics?category=development
 * GET /api/tactics/search?q=tdd
 */
export function handleGetTactics(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
  requestId: string,
): void {
  const url = new URL(req.url ?? "/", "http://localhost");

  // 搜索模式
  if (url.pathname.endsWith("/search")) {
    const query = url.searchParams.get("q") ?? "";
    if (query.trim() === "") {
      sendError(res, 400, "MISSING_QUERY", "搜索词 ?q= 不能为空", requestId);
      return;
    }
    const results = ctx.tacticRegistry.search(query).map(toSummary);
    sendJson(res, { query, results, total: results.length }, 200, requestId);
    return;
  }

  // 按类别过滤
  const category = url.searchParams.get("category") as TacticDefinition["category"] | null;
  const all =
    category !== null ? ctx.tacticRegistry.getByCategory(category) : ctx.tacticRegistry.getAll();

  const summaries = all.map(toSummary);
  sendJson(res, { tactics: summaries, total: summaries.length }, 200, requestId);
}

/**
 * GET /api/tactics/:id — 获取单条战术详情（含完整系统提示）
 */
export function handleGetTactic(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
  tacticId: string,
  requestId: string,
): void {
  const tactic = ctx.tacticRegistry.get(tacticId);
  if (tactic === undefined) {
    sendError(res, 404, "TACTIC_NOT_FOUND", `战术不存在：${tacticId}`, requestId);
    return;
  }

  // 完整详情包含 systemPrompt（教练有权查看战术手册）
  sendJson(
    res,
    {
      ...toSummary(tactic),
      systemPrompt: tactic.systemPrompt,
      version: tactic.version,
      author: tactic.author,
    },
    200,
    requestId,
  );
}

/**
 * @dream-xi/server — HTTP 服务器主入口
 *
 * 使用 Node.js 原生 http 模块创建服务器（无框架依赖）。
 * 路由分发采用简洁的 URL + Method 匹配模式。
 *
 * 路由表：
 *   GET  /health              — 健康检查
 *   GET  /api/health          — 健康检查（别名）
 *   GET  /api/players         — 所有球员状态
 *   GET  /api/players/:id     — 单名球员状态
 *   POST /api/chat            — 发送消息（A2A 路由）
 *   GET  /api/threads         — 线程列表
 *   POST /api/threads         — 创建线程
 *   POST /api/threads/:id/archive  — 归档线程
 *   GET  /api/memory/:playerId — 查询球员情景记忆
 *   GET  /api/fair-play/stats  — 铁律守卫统计
 */

import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { FairPlayGuard, createStrictGuard } from "@dream-xi/fair-play";
import { MemoryManager, createInMemoryManager } from "@dream-xi/memory";
import { MessageRouter } from "@dream-xi/router";
import { createDefaultRegistry } from "@dream-xi/tactic";
import type { DreamXiConfig } from "@dream-xi/types";
import {
  type RequestWithId,
  corsMiddleware,
  requestLogger,
  sendError,
} from "./middleware/index.js";
import { handleHealth } from "./routes/health.js";
import { handleGetPlayer, handleGetPlayers } from "./routes/players.js";

// ─────────────────────────────────────────────────────────────────────────────
// 服务器上下文（运行时共享的单例实例）
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerContext {
  config: DreamXiConfig;
  guard: FairPlayGuard;
  memory: MemoryManager;
  router: MessageRouter;
  tacticRegistry: ReturnType<typeof createDefaultRegistry>;
}

/**
 * 创建服务器运行时上下文
 */
export function createServerContext(config: DreamXiConfig): ServerContext {
  const guard = createStrictGuard();
  const memory = createInMemoryManager();
  const router = new MessageRouter();
  const tacticRegistry = createDefaultRegistry();

  return { config, guard, memory, router, tacticRegistry };
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由分发
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 主路由分发器
 */
async function dispatch(
  req: RequestWithId,
  res: ServerResponse,
  ctx: ServerContext,
): Promise<void> {
  const { method } = req;
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const rid = req.requestId;

  // ── 健康检查 ──────────────────────────────────────────────────────────────
  if ((path === "/health" || path === "/api/health") && method === "GET") {
    handleHealth(req, res, ctx.config, rid);
    return;
  }

  // ── 球员 API ──────────────────────────────────────────────────────────────
  if (path === "/api/players" && method === "GET") {
    handleGetPlayers(req, res, ctx.config, rid);
    return;
  }

  const playerMatch = path.match(/^\/api\/players\/([^/]+)$/);
  if (playerMatch !== null && method === "GET") {
    handleGetPlayer(req, res, ctx.config, playerMatch[1] ?? "", rid);
    return;
  }

  // ── 战术 API ───────────────────────────────────────────────────────────────
  if ((path === "/api/tactics" || path === "/api/tactics/search") && method === "GET") {
    const { handleGetTactics } = await import("./routes/tactics.js");
    handleGetTactics(req, res, ctx, rid);
    return;
  }

  const tacticMatch = path.match(/^\/api\/tactics\/([^/]+)$/);
  if (tacticMatch !== null && method === "GET") {
    const { handleGetTactic } = await import("./routes/tactics.js");
    handleGetTactic(req, res, ctx, tacticMatch[1] ?? "", rid);
    return;
  }

  // ── 聊天 API（POST /api/chat）──────────────────────────────────────────────
  if (path === "/api/chat" && method === "POST") {
    const { handleChat } = await import("./routes/chat.js");
    await handleChat(req, res, ctx, rid);
    return;
  }

  // ── 线程 API ───────────────────────────────────────────────────────────────
  if (path === "/api/threads" && (method === "GET" || method === "POST")) {
    const { handleThreads } = await import("./routes/threads.js");
    await handleThreads(req, res, ctx, rid);
    return;
  }

  const archiveMatch = path.match(/^\/api\/threads\/([^/]+)\/archive$/);
  if (archiveMatch !== null && method === "POST") {
    const { handleArchiveThread } = await import("./routes/threads.js");
    await handleArchiveThread(req, res, ctx, archiveMatch[1] ?? "", rid);
    return;
  }

  // ── 记忆 API ──────────────────────────────────────────────────────────────
  const memoryMatch = path.match(/^\/api\/memory\/([^/]+)$/);
  if (memoryMatch !== null && method === "GET") {
    const { handleGetMemory } = await import("./routes/memory.js");
    await handleGetMemory(req, res, ctx, memoryMatch[1] ?? "", rid);
    return;
  }

  // ── 铁律统计 ──────────────────────────────────────────────────────────────
  if (path === "/api/fair-play/stats" && method === "GET") {
    const { handleFairPlayStats } = await import("./routes/fair-play.js");
    handleFairPlayStats(req, res, ctx, rid);
    return;
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  sendError(res, 404, "NOT_FOUND", `端点不存在：${method} ${path}`, rid);
}

// ─────────────────────────────────────────────────────────────────────────────
// 服务器工厂
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建并启动 Dream XI HTTP 服务器
 *
 * @example
 * ```ts
 * const { config } = loadConfig();
 * const server = createDreamXiServer(config);
 * server.listen(config.server.port, () => {
 *   console.log(`⚽ Dream XI 服务器已启动 → http://localhost:${config.server.port}`);
 * });
 * ```
 */
export function createDreamXiServer(config: DreamXiConfig) {
  const ctx = createServerContext(config);
  const { corsOrigins } = config.security;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const typedReq = req as RequestWithId;

    // 中间件链
    requestLogger(typedReq, res, () => {
      corsMiddleware(corsOrigins, req, res, () => {
        // 路由分发（异步）
        dispatch(typedReq, res, ctx).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "内部服务器错误";
          console.error("💥 未处理的路由错误：", err);
          sendError(res, 500, "INTERNAL_ERROR", message, typedReq.requestId);
        });
      });
    });
  });

  return server;
}

// ─────────────────────────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────────────────────────

export type { RequestWithId };
export { FairPlayGuard, createStrictGuard };
export { MemoryManager, createInMemoryManager };
export { MessageRouter };

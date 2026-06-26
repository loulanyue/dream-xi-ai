/**
 * @dream-xi/server — 线程管理路由
 *
 * GET  /api/threads               — 获取所有线程（战术板列表）
 * POST /api/threads               — 创建新线程（/new 指令）
 * POST /api/threads/:id/archive   — 归档线程（比赛结束）
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerContext } from "../index.js";
import type { CreateThreadRequest, ThreadSummary } from "../types.js";
import {
  parseJsonBody,
  sendJson,
  sendError,
} from "../middleware/index.js";

/**
 * GET /api/threads  — 列出所有线程
 * POST /api/threads — 创建新线程
 */
export async function handleThreads(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
  requestId: string,
): Promise<void> {
  if (req.method === "GET") {
    const threads = ctx.router.threads.list();
    const summaries: ThreadSummary[] = threads.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      messageCount: t.messageCount,
      participants: t.participants,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      tags: t.tags ?? [],
    }));
    sendJson(res, summaries, 200, requestId);
    return;
  }

  // POST — 创建线程
  let body: CreateThreadRequest = {};
  try {
    body = await parseJsonBody<CreateThreadRequest>(req);
  } catch {
    sendError(res, 400, "INVALID_BODY", "请求体解析失败", requestId);
    return;
  }

  const thread = ctx.router.threads.create({
    createdBy: "coach",
    title: body.title,
    tags: body.tags,
  });
  ctx.router.threads.setActive(thread.id);

  const summary: ThreadSummary = {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    messageCount: thread.messageCount,
    participants: thread.participants,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    tags: thread.tags ?? [],
  };

  sendJson(res, summary, 201, requestId);
}

/**
 * POST /api/threads/:id/archive — 归档线程
 */
export async function handleArchiveThread(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
  threadId: string,
  requestId: string,
): Promise<void> {
  const thread = ctx.router.threads.get(threadId);
  if (thread === undefined) {
    sendError(res, 404, "THREAD_NOT_FOUND", `线程不存在：${threadId}`, requestId);
    return;
  }

  const archived = ctx.router.threads.archive(threadId);

  // 归档时保存赛后记忆摘要
  if (archived.participants.length > 0) {
    for (const playerId of archived.participants) {
      await ctx.memory.saveEpisodic({
        playerId,
        sourceThreadId: threadId,
        threadSummary: `线程「${archived.title}」已归档，共 ${archived.messageCount} 条消息`,
        keyDecisions: [],
        lessonsLearned: [],
        importance: 0.4,
        tags: ["archived", "auto"],
      });
    }
  }

  sendJson(res, {
    id: archived.id,
    title: archived.title,
    status: archived.status,
    archivedAt: new Date().toISOString(),
  }, 200, requestId);
}

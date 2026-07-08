/**
 * @dream-xi/server — POST /api/chat 聊天路由
 *
 * 核心业务端点：接收消息 → A2A 路由 → 记忆注入 → 球员回复。
 *
 * 完整流程：
 *   1. 解析请求体
 *   2. 铁律守卫检查（Fair Play check）
 *   3. 确定/创建线程
 *   4. A2A 消息路由（@mention / 意图推断 / 强制指定）
 *   5. 查询情景记忆，注入提示上下文
 *   6. 触发战术加载（自动检测关键词）
 *   7. 构建 LLM 请求上下文（含身份锚定卡）
 *   8. 模拟球员回复（Stub — 接入真实 LLM 在后续版本）
 *   9. 追加消息到工作记忆，检查是否触发压缩
 *  10. 返回标准 ChatResponse
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { PlayerTacticSlot, detectTriggers } from "@dream-xi/tactic";
import type { PlayerId } from "@dream-xi/types";
import { PLAYER_DEFINITIONS } from "@dream-xi/types";
import type { ServerContext } from "../index.js";
import { parseJsonBody, sendError, sendJson } from "../middleware/index.js";
import type { ChatRequest, ChatResponse } from "../types.js";

/**
 * POST /api/chat
 */
export async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
  requestId: string,
): Promise<void> {
  // 步骤 1：解析请求体
  let body: ChatRequest;
  try {
    body = await parseJsonBody<ChatRequest>(req);
  } catch {
    sendError(res, 400, "INVALID_BODY", "请求体 JSON 解析失败", requestId);
    return;
  }

  const { message, threadId: incomingThreadId, playerId: forcedPlayer, options = {} } = body;

  if (!message || message.trim() === "") {
    sendError(res, 400, "EMPTY_MESSAGE", "消息内容不能为空", requestId);
    return;
  }

  // 步骤 2：铁律守卫检查（验证此聊天请求的来源合规）
  const guardResult = ctx.guard.check({
    playerId: forcedPlayer ?? "leo",
    type: "network-request",
    target: `http://localhost:${ctx.config.server.port}/api/chat`,
  });
  if (!guardResult.allowed) {
    sendError(
      res,
      403,
      "FAIR_PLAY_VIOLATION",
      guardResult.rejectionMessage ?? "铁律违规",
      requestId,
    );
    return;
  }

  // 步骤 3：确定/创建线程
  let threadId = incomingThreadId;
  if (threadId === undefined) {
    const newThread = ctx.router.threads.create({ createdBy: "coach" });
    ctx.router.threads.setActive(newThread.id);
    threadId = newThread.id;
  }

  // 步骤 4：A2A 消息路由
  let routeResult: ReturnType<typeof ctx.router.route>;
  let routeMethod: ChatResponse["routeMethod"];

  if (forcedPlayer !== undefined) {
    // 强制路由
    const thread = ctx.router.threads.get(threadId);
    if (thread === undefined) {
      sendError(res, 404, "THREAD_NOT_FOUND", `线程不存在：${threadId}`, requestId);
      return;
    }
    routeResult = ctx.router.route({ text: message, threadId, senderId: "coach" });
    // 覆盖 resolvedTarget
    (routeResult.routing as { resolvedTarget: PlayerId }).resolvedTarget = forcedPlayer;
    routeMethod = "forced";
  } else {
    routeResult = ctx.router.route({ text: message, threadId, senderId: "coach" });
    routeMethod = routeResult.routeMethod;
  }

  const targetPlayerId = routeResult.routing.resolvedTarget;
  const playerDef = PLAYER_DEFINITIONS[targetPlayerId];

  // 步骤 5：查询情景记忆（最近 3 条，注入上下文）
  const _episodicMemories = await ctx.memory.queryEpisodic({
    playerId: targetPlayerId,
    limit: 3,
    minImportance: 0.3,
  });
  const memoryContext = await ctx.memory.buildMemoryContext(targetPlayerId, 3);

  // 步骤 6：战术自动加载
  const tacticSlot = new PlayerTacticSlot(targetPlayerId, ctx.tacticRegistry);
  const triggeredTactics = detectTriggers(message, ctx.tacticRegistry);
  for (const tacticId of triggeredTactics.slice(0, 2)) {
    tacticSlot.load(tacticId, "auto");
  }
  // 强制加载用户指定的战术
  for (const tacticId of options.tactics ?? []) {
    tacticSlot.load(tacticId, "explicit");
  }

  // 步骤 7：构建系统提示（身份 + 记忆 + 战术）
  const basePrompt = [
    `你是 ${playerDef.nameZh}（${playerDef.nameEn}），编号 #${playerDef.number}。`,
    `职责：${playerDef.description}`,
    memoryContext ? `\n${memoryContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fullSystemPrompt = tacticSlot.buildSystemPrompt(basePrompt);

  // 步骤 8：模拟球员回复（Stub — 真实 LLM 接入在后续版本）
  const stubReply = buildStubReply(targetPlayerId, message, tacticSlot.loadedIds, fullSystemPrompt);
  const stubTokens = {
    input: Math.floor(fullSystemPrompt.length / 4),
    output: Math.floor(stubReply.length / 4),
    total: 0,
  };
  stubTokens.total = stubTokens.input + stubTokens.output;

  // 步骤 9：追加到工作记忆
  const memoryResult = await ctx.memory.processMessage(
    targetPlayerId,
    threadId,
    routeResult.message,
  );

  // 步骤 10：构建响应
  const response: ChatResponse = {
    messageId: routeResult.message.id,
    threadId,
    handledBy: targetPlayerId,
    routeMethod,
    reply: stubReply,
    tokenUsage: stubTokens,
    loadedTactics: tacticSlot.loadedIds,
    memoryCompressed: memoryResult.compressionTriggered,
  };

  sendJson(res, response, 200, requestId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub 回复生成（接入真实 LLM 前的占位实现）
// ─────────────────────────────────────────────────────────────────────────────

function buildStubReply(
  playerId: PlayerId,
  message: string,
  loadedTactics: string[],
  _systemPrompt: string,
): string {
  const def = PLAYER_DEFINITIONS[playerId];
  const tacticNote =
    loadedTactics.length > 0 ? `\n\n> 🎯 当前战术：${loadedTactics.join("、")}` : "";

  const replyPrefixes: Record<PlayerId, string> = {
    leo: `[${def.nameZh} #${def.number}] 收到指令，正在分析...\n\n`,
    andre: `[${def.nameZh} #${def.number}] 收到，开始审查...\n\n`,
    flash: `[${def.nameZh} #${def.number}] 明白，快速响应！\n\n`,
    wall: `[${def.nameZh} #${def.number}] 了解，稳扎稳打。\n\n`,
    gate: "[质量门禁] 正在执行门禁检查...\n\n",
  };

  const prefix = replyPrefixes[playerId] ?? `[${def.nameZh}] `;

  return `${prefix}你的请求「${message.slice(0, 50)}${message.length > 50 ? "..." : ""}」已收到。\n\n> ⚠️ 当前为 Stub 模式，真实 LLM 接入将在 v1.2.0 版本完成。${tacticNote}`;
}

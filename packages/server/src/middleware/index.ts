/**
 * @dream-xi/server — 请求日志中间件
 *
 * 为每个请求生成唯一 requestId，记录方法/路径/状态/耗时。
 * 使用足球主题的日志风格。
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** 扩展 IncomingMessage 添加 requestId */
export interface RequestWithId extends IncomingMessage {
  requestId: string;
  startTime: number;
}

/**
 * 生成唯一请求 ID
 * 格式：match-{timestamp}-{random}（比赛场次编号风格）
 */
function generateRequestId(): string {
  return `match-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 简单的请求日志中间件（Node.js 原生 http 兼容）
 *
 * 使用方式（Express 风格 handler 适配）：
 * ```ts
 * app.use((req, res, next) => {
 *   requestLogger(req as RequestWithId, res, next);
 * });
 * ```
 */
export function requestLogger(
  req: RequestWithId,
  res: ServerResponse,
  next: () => void,
): void {
  req.requestId = generateRequestId();
  req.startTime = Date.now();

  const { method, url } = req;

  res.on("finish", () => {
    const duration = Date.now() - req.startTime;
    const status = res.statusCode;
    const icon = status >= 500 ? "🔴" : status >= 400 ? "🟡" : "🟢";
    console.log(
      `${icon} [${req.requestId}] ${method} ${url} → ${status} (${duration}ms)`,
    );
  });

  next();
}

/**
 * CORS 中间件（开发环境允许所有来源）
 */
export function corsMiddleware(
  allowedOrigins: string[],
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const origin = req.headers["origin"];
  const isAllowed =
    allowedOrigins.includes("*") ||
    (origin !== undefined && allowedOrigins.includes(origin));

  if (isAllowed && origin !== undefined) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  next();
}

/**
 * JSON 请求体解析（原生 Node.js，无需 express.json()）
 */
export async function parseJsonBody<T = unknown>(
  req: IncomingMessage,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body.length > 0 ? (JSON.parse(body) as T) : ({} as T));
      } catch {
        reject(new Error("请求体 JSON 解析失败"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * 错误处理工具：构建标准错误响应
 */
export function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  requestId: string = "unknown",
): void {
  const body = JSON.stringify({
    ok: false,
    error: { code, message },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      version: "1.0.0-alpha",
    },
  });
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(body);
}

/**
 * 成功响应工具：构建标准成功响应
 */
export function sendJson<T>(
  res: ServerResponse,
  data: T,
  statusCode: number = 200,
  requestId: string = "unknown",
): void {
  const body = JSON.stringify({
    ok: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      version: "1.0.0-alpha",
    },
  });
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(body);
}

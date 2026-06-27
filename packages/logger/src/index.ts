/**
 * @dream-xi/logger — 结构化日志包
 *
 * Dream XI AI 平台统一日志输出。零外部依赖，输出 JSON Lines 格式。
 *
 * 设计原则：
 *   - 零依赖：仅使用 Node.js 内置 API
 *   - JSON Lines：每条日志一行 JSON，方便机器解析和流式传输
 *   - 日志级别：trace / debug / info / warn / error / fatal
 *   - 子 Logger：通过 `child(bindings)` 携带固定上下文字段
 *   - 请求日志：内置 `requestLogger` 中间件格式
 *   - 可插拔输出：默认 stdout/stderr，可替换为任意 WritableStream
 *   - 生产 / 开发模式：生产输出紧凑 JSON，开发输出带颜色的可读格式
 *
 * @example
 * ```ts
 * import { createLogger } from "@dream-xi/logger";
 *
 * const log = createLogger({ name: "server", level: "info" });
 *
 * log.info({ port: 3000 }, "Dream XI server started");
 * log.error({ err, requestId }, "Unhandled error in chat route");
 *
 * // 子 Logger（继承父级配置 + 额外固定字段）
 * const routeLog = log.child({ route: "/api/chat" });
 * routeLog.debug({ userId: "coach" }, "Processing chat request");
 * ```
 *
 * @module
 */

import { stdout, stderr } from "node:process";
import type { Writable } from "node:stream";

// ─────────────────────────────────────────────────────────────────────────────
// 日志级别
// ─────────────────────────────────────────────────────────────────────────────

/** 日志级别（数字越大级别越高） */
export const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;
export type LogLevelValue = (typeof LOG_LEVELS)[LogLevel];

// ─────────────────────────────────────────────────────────────────────────────
// 日志记录类型
// ─────────────────────────────────────────────────────────────────────────────

/** 单条日志记录的完整结构（JSON Lines 格式） */
export interface LogRecord {
  /** ISO 8601 时间戳（UTC） */
  time: string;
  /** 日志级别数值 */
  level: LogLevelValue;
  /** Logger 名称 */
  name: string;
  /** 日志消息 */
  msg: string;
  /** 可选：错误信息（序列化 Error） */
  err?: SerializedError;
  /** 来自 child bindings 和方法调用的额外字段 */
  [key: string]: unknown;
}

/** 序列化后的 Error 对象 */
export interface SerializedError {
  type: string;
  message: string;
  stack?: string;
  code?: string | number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger 配置
// ─────────────────────────────────────────────────────────────────────────────

/** `createLogger` 配置选项 */
export interface LoggerOptions {
  /**
   * Logger 名称（出现在每条日志的 `name` 字段）
   * @default "dream-xi"
   */
  name?: string;
  /**
   * 最低输出级别，低于此级别的日志将被丢弃。
   * @default "info"
   */
  level?: LogLevel;
  /**
   * 输出模式：
   *   - `"json"`：紧凑 JSON（生产推荐）
   *   - `"pretty"`：带颜色和缩进的可读格式（开发推荐）
   *   - `"silent"`：不输出任何日志（测试用）
   * @default process.env.NODE_ENV === "production" ? "json" : "pretty"
   */
  format?: "json" | "pretty" | "silent";
  /**
   * 标准输出流（info/debug/trace 写入此流）
   * @default process.stdout
   */
  stdout?: Writable;
  /**
   * 错误输出流（warn/error/fatal 写入此流）
   * @default process.stderr
   */
  stderr?: Writable;
  /**
   * 固定绑定字段（每条日志都会携带）
   */
  bindings?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 颜色工具（pretty 模式）
// ─────────────────────────────────────────────────────────────────────────────

const COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m",  // 灰色
  debug: "\x1b[36m",  // 青色
  info:  "\x1b[32m",  // 绿色
  warn:  "\x1b[33m",  // 黄色
  error: "\x1b[31m",  // 红色
  fatal: "\x1b[35m",  // 紫色
};
const RESET = "\x1b[0m";
const DIM   = "\x1b[2m";
const BOLD  = "\x1b[1m";

// ─────────────────────────────────────────────────────────────────────────────
// Error 序列化
// ─────────────────────────────────────────────────────────────────────────────

function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    const serialized: SerializedError = {
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
    };
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== undefined) serialized.code = code;
    return serialized;
  }
  return { type: "Unknown", message: String(err) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger 类
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dream XI 结构化 Logger。
 *
 * 不建议直接 `new Logger()`，请使用 `createLogger()` 工厂函数。
 */
export class Logger {
  private readonly name: string;
  private readonly minLevel: LogLevelValue;
  private readonly format: "json" | "pretty" | "silent";
  private readonly out: Writable;
  private readonly err: Writable;
  private readonly bindings: Record<string, unknown>;

  constructor(options: Required<LoggerOptions>) {
    this.name     = options.name;
    this.minLevel = LOG_LEVELS[options.level];
    this.format   = options.format;
    this.out      = options.stdout;
    this.err      = options.stderr;
    this.bindings = options.bindings;
  }

  // ── 日志方法 ──────────────────────────────────────────────────────────────

  trace(obj: Record<string, unknown>, msg: string): void;
  trace(msg: string): void;
  trace(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log("trace", objOrMsg, msg);
  }

  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  debug(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log("debug", objOrMsg, msg);
  }

  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log("info", objOrMsg, msg);
  }

  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log("warn", objOrMsg, msg);
  }

  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log("error", objOrMsg, msg);
  }

  fatal(obj: Record<string, unknown>, msg: string): void;
  fatal(msg: string): void;
  fatal(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log("fatal", objOrMsg, msg);
  }

  // ── child ─────────────────────────────────────────────────────────────────

  /**
   * 创建子 Logger，继承父级的所有配置，并追加额外固定字段。
   *
   * @example
   * ```ts
   * const requestLog = log.child({ requestId: "req-abc123", route: "/api/chat" });
   * requestLog.info("Processing request");
   * // → { ..., requestId: "req-abc123", route: "/api/chat", msg: "Processing request" }
   * ```
   */
  child(extraBindings: Record<string, unknown>): Logger {
    return new Logger({
      name: this.name,
      level: this._levelName(),
      format: this.format,
      stdout: this.out,
      stderr: this.err,
      bindings: { ...this.bindings, ...extraBindings },
    });
  }

  // ── isLevelEnabled ────────────────────────────────────────────────────────

  /** 判断某日志级别是否会被输出（用于避免昂贵的参数计算） */
  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  // ── 内部：写日志 ──────────────────────────────────────────────────────────

  private _log(
    level: LogLevel,
    objOrMsg: Record<string, unknown> | string,
    msg: string | undefined,
  ): void {
    if (this.format === "silent") return;
    if (LOG_LEVELS[level] < this.minLevel) return;

    const isError = LOG_LEVELS[level] >= LOG_LEVELS.warn;
    const stream  = isError ? this.err : this.out;

    let fields: Record<string, unknown>;
    let message: string;

    if (typeof objOrMsg === "string") {
      fields  = {};
      message = objOrMsg;
    } else {
      const { err: errField, ...rest } = objOrMsg;
      fields  = rest;
      message = msg ?? "";
      if (errField !== undefined) {
        fields["err"] = serializeError(errField);
      }
    }

    const record: LogRecord = {
      time:  new Date().toISOString(),
      level: LOG_LEVELS[level],
      name:  this.name,
      msg:   message,
      ...this.bindings,
      ...fields,
    };

    const line = this.format === "pretty"
      ? this._formatPretty(level, record)
      : JSON.stringify(record);

    stream.write(line + "\n");
  }

  private _formatPretty(level: LogLevel, record: LogRecord): string {
    const color = COLORS[level];
    const time  = DIM + record.time.replace("T", " ").replace("Z", "") + RESET;
    const lvl   = color + BOLD + level.toUpperCase().padEnd(5) + RESET;
    const name  = DIM + `[${record.name}]` + RESET;
    const msg   = record.msg;

    // 额外字段（排除基础字段）
    const { time: _t, level: _l, name: _n, msg: _m, ...extra } = record;
    const extraStr = Object.keys(extra).length > 0
      ? " " + DIM + JSON.stringify(extra) + RESET
      : "";

    return `${time} ${lvl} ${name} ${msg}${extraStr}`;
  }

  private _levelName(): LogLevel {
    for (const [name, val] of Object.entries(LOG_LEVELS) as Array<[LogLevel, LogLevelValue]>) {
      if (val === this.minLevel) return name;
    }
    return "info";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建新的 Logger 实例。
 *
 * @example
 * ```ts
 * // 生产（JSON 格式，info 级别）
 * const log = createLogger({ name: "server" });
 *
 * // 开发（pretty 格式，debug 级别）
 * const log = createLogger({ name: "server", level: "debug", format: "pretty" });
 *
 * // 测试（静默）
 * const log = createLogger({ name: "test", format: "silent" });
 * ```
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const isProd = process.env["NODE_ENV"] === "production";

  return new Logger({
    name:     options.name    ?? "dream-xi",
    level:    options.level   ?? (isProd ? "info" : "debug"),
    format:   options.format  ?? (isProd ? "json" : "pretty"),
    stdout:   options.stdout  ?? stdout,
    stderr:   options.stderr  ?? stderr,
    bindings: options.bindings ?? {},
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 请求日志工具
// ─────────────────────────────────────────────────────────────────────────────

/** HTTP 请求日志条目 */
export interface RequestLogEntry {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  userAgent?: string;
  contentLength?: number;
}

/**
 * 记录 HTTP 请求日志。
 *
 * @example
 * ```ts
 * const start = Date.now();
 * // ... 处理请求 ...
 * logRequest(log, {
 *   requestId: "req-abc",
 *   method: "POST",
 *   url: "/api/chat",
 *   statusCode: 200,
 *   durationMs: Date.now() - start,
 * });
 * ```
 */
export function logRequest(logger: Logger, entry: RequestLogEntry): void {
  const level: LogLevel = entry.statusCode >= 500
    ? "error"
    : entry.statusCode >= 400
    ? "warn"
    : "info";

  logger[level](
    {
      requestId:     entry.requestId,
      method:        entry.method,
      url:           entry.url,
      statusCode:    entry.statusCode,
      durationMs:    entry.durationMs,
      ...(entry.userAgent     ? { userAgent: entry.userAgent }         : {}),
      ...(entry.contentLength ? { contentLength: entry.contentLength } : {}),
    },
    `${entry.method} ${entry.url} ${entry.statusCode} (${entry.durationMs}ms)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 全局单例 Logger
// ─────────────────────────────────────────────────────────────────────────────

let _rootLogger: Logger | null = null;

/**
 * 获取全局根 Logger 单例。
 *
 * 适用于顶层脚本和 CLI 入口；模块内部推荐用 `createLogger` 创建独立实例。
 *
 * @example
 * ```ts
 * // main.ts
 * import { getRootLogger } from "@dream-xi/logger";
 * const log = getRootLogger();
 * log.info({ port: 3000 }, "Server starting");
 * ```
 */
export function getRootLogger(): Logger {
  if (_rootLogger === null) {
    _rootLogger = createLogger({ name: "dream-xi" });
  }
  return _rootLogger;
}

/**
 * 替换全局根 Logger（测试或初始化时使用）。
 */
export function setRootLogger(logger: Logger): void {
  _rootLogger = logger;
}

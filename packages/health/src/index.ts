/**
 * @dream-xi/health — 深度健康检查系统
 *
 * 为 Dream XI AI 提供三类标准探针，对标 Kubernetes 健康检查规范：
 *
 *   - **Liveness Probe**（存活探针）：服务是否还活着，失败则重启容器
 *   - **Readiness Probe**（就绪探针）：服务是否能接受流量，失败则从负载均衡摘除
 *   - **Startup Probe**（启动探针）：初始化是否完成，完成前不做 liveness 检查
 *
 * 核心能力：
 *   - 注册式检查器（Register-based）：按需添加自定义健康检查项
 *   - 并行执行 + 超时控制：每个检查器独立超时，互不阻塞
 *   - 依赖分级：`critical`（关键）| `degraded`（降级）| `optional`（可选）
 *   - 结构化 JSON 报告：适合监控系统采集
 *   - 内存用量检查：内置系统级检查
 *   - HTTP 路由适配器：开箱即用的 `/health/live` `/health/ready` 路由处理器
 *
 * @example
 * ```ts
 * import { HealthRegistry, ProbeType } from "@dream-xi/health";
 *
 * const registry = new HealthRegistry({ name: "dream-xi-server", version: "1.8.0-alpha" });
 *
 * // 注册数据库连接检查
 * registry.register({
 *   name: "redis",
 *   probe: ProbeType.Readiness,
 *   criticality: "critical",
 *   check: async () => {
 *     await redisClient.ping();
 *     return { connected: true };
 *   },
 * });
 *
 * // 注册内置内存检查
 * registry.registerMemoryCheck({ heapUsedThresholdMb: 512 });
 *
 * // 执行所有就绪检查
 * const report = await registry.runReadiness();
 * console.log(report.status); // "healthy" | "degraded" | "unhealthy"
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 基础类型
// ─────────────────────────────────────────────────────────────────────────────

/** 探针类型 */
export const ProbeType = {
  Liveness:  "liveness",
  Readiness: "readiness",
  Startup:   "startup",
} as const;

export type ProbeType = (typeof ProbeType)[keyof typeof ProbeType];

/** 检查器重要级别 */
export type CheckerCriticality =
  | "critical"   // 关键：失败则整体 unhealthy（liveness 失败 → 重启）
  | "degraded"   // 降级：失败则整体 degraded（readiness 失败 → 摘流量）
  | "optional";  // 可选：失败只记录，不影响整体状态

/** 单项检查结果状态 */
export type CheckStatus = "pass" | "warn" | "fail";

/** 单项检查器配置 */
export interface CheckerConfig<TExtra = Record<string, unknown>> {
  /** 检查器唯一名称 */
  name: string;
  /** 适用的探针类型（可多个） */
  probe: ProbeType | ProbeType[];
  /** 重要级别 */
  criticality: CheckerCriticality;
  /**
   * 执行检查的异步函数。
   * 返回任意额外信息（会合并到报告）；抛出错误则视为 fail。
   */
  check: () => Promise<TExtra> | TExtra;
  /**
   * 单次检查超时（毫秒）。超时视为 fail。
   * @default 5000
   */
  timeoutMs?: number;
  /**
   * 人类可读的检查描述
   */
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 报告类型
// ─────────────────────────────────────────────────────────────────────────────

/** 整体健康状态 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/** 单项检查结果 */
export interface CheckResult {
  name: string;
  status: CheckStatus;
  criticality: CheckerCriticality;
  /** 检查耗时（毫秒） */
  durationMs: number;
  /** 检查返回的额外信息 */
  details?: Record<string, unknown>;
  /** 错误消息（status=fail 时） */
  error?: string;
  /** 检查时间戳 */
  timestamp: string;
}

/** 完整健康报告 */
export interface HealthReport {
  /** 服务名称 */
  service: string;
  /** 服务版本 */
  version: string;
  /** 整体状态 */
  status: HealthStatus;
  /** 探针类型 */
  probe: ProbeType;
  /** 所有检查结果 */
  checks: CheckResult[];
  /** 报告生成时间（ISO 8601） */
  timestamp: string;
  /** 总耗时（毫秒） */
  durationMs: number;
  /** 服务启动至今的运行秒数 */
  uptimeSeconds: number;
  /** Node.js 进程内存快照 */
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    externalMb: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具：带超时的 Promise
// ─────────────────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`健康检查 "${label}" 超时（限制 ${ms}ms）`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HealthRegistry
// ─────────────────────────────────────────────────────────────────────────────

/** `HealthRegistry` 构造选项 */
export interface HealthRegistryOptions {
  /** 服务名称（出现在报告中） */
  name: string;
  /** 服务版本 */
  version: string;
}

/**
 * 健康检查注册中心。
 *
 * 注册各类检查器后，调用 `runLiveness()` / `runReadiness()` / `runStartup()` 获取报告。
 */
export class HealthRegistry {
  private readonly checkers: Map<string, CheckerConfig> = new Map();
  private readonly startedAt = Date.now();
  private readonly serviceName: string;
  private readonly serviceVersion: string;

  constructor(options: HealthRegistryOptions) {
    this.serviceName    = options.name;
    this.serviceVersion = options.version;
  }

  // ── 注册 ──────────────────────────────────────────────────────────────────

  /**
   * 注册自定义健康检查器。
   */
  register<T = Record<string, unknown>>(config: CheckerConfig<T>): this {
    if (this.checkers.has(config.name)) {
      throw new Error(`[HealthRegistry] 检查器名称重复: "${config.name}"`);
    }
    this.checkers.set(config.name, config as CheckerConfig);
    return this;
  }

  /**
   * 注册内置内存使用检查器。
   *
   * @param options.heapUsedThresholdMb heap 使用超过此值时降级（默认 512MB）
   * @param options.probe 适用探针（默认 liveness + readiness）
   */
  registerMemoryCheck(options: {
    heapUsedThresholdMb?: number;
    probe?: ProbeType | ProbeType[];
  } = {}): this {
    const threshold = options.heapUsedThresholdMb ?? 512;
    const probe     = options.probe ?? [ProbeType.Liveness, ProbeType.Readiness];

    return this.register({
      name:        "memory",
      probe,
      criticality: "degraded",
      description: `Node.js heap 使用率检查（阈值 ${threshold}MB）`,
      timeoutMs:   1000,
      check: () => {
        const mem = process.memoryUsage();
        const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
        if (heapUsedMb > threshold) {
          throw new Error(`heap 已用 ${heapUsedMb}MB，超过阈值 ${threshold}MB`);
        }
        return {
          heapUsedMb,
          thresholdMb: threshold,
          utilizationPct: Math.round((heapUsedMb / threshold) * 100),
        };
      },
    });
  }

  /**
   * 注册内置进程运行时间检查器（startup probe 专用）。
   *
   * 启动后超过 `minUptimeMs` 视为启动完成。
   */
  registerStartupCheck(options: { minUptimeMs?: number } = {}): this {
    const minUptimeMs = options.minUptimeMs ?? 5000;

    return this.register({
      name:        "startup-ready",
      probe:       ProbeType.Startup,
      criticality: "critical",
      description: `服务启动检查（最少运行 ${minUptimeMs}ms）`,
      timeoutMs:   1000,
      check: () => {
        const uptimeMs = Date.now() - this.startedAt;
        if (uptimeMs < minUptimeMs) {
          throw new Error(`服务仍在启动中（已运行 ${uptimeMs}ms / 需要 ${minUptimeMs}ms）`);
        }
        return { uptimeMs, minUptimeMs, ready: true };
      },
    });
  }

  // ── 执行探针 ──────────────────────────────────────────────────────────────

  /** 执行存活探针（liveness）检查 */
  runLiveness(): Promise<HealthReport> {
    return this._run(ProbeType.Liveness);
  }

  /** 执行就绪探针（readiness）检查 */
  runReadiness(): Promise<HealthReport> {
    return this._run(ProbeType.Readiness);
  }

  /** 执行启动探针（startup）检查 */
  runStartup(): Promise<HealthReport> {
    return this._run(ProbeType.Startup);
  }

  // ── 内部执行 ──────────────────────────────────────────────────────────────

  private async _run(probe: ProbeType): Promise<HealthReport> {
    const reportStart = Date.now();

    // 筛选适用此探针的检查器
    const applicableCheckers = Array.from(this.checkers.values()).filter((c) => {
      const probes = Array.isArray(c.probe) ? c.probe : [c.probe];
      return probes.includes(probe);
    });

    // 并行执行所有检查
    const results = await Promise.all(
      applicableCheckers.map((checker) => this._runChecker(checker)),
    );

    // 汇总状态
    const overallStatus = this._computeStatus(results);

    // 内存快照
    const mem = process.memoryUsage();

    return {
      service:       this.serviceName,
      version:       this.serviceVersion,
      status:        overallStatus,
      probe,
      checks:        results,
      timestamp:     new Date().toISOString(),
      durationMs:    Date.now() - reportStart,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      memory: {
        heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        rssMb:       Math.round(mem.rss       / 1024 / 1024),
        externalMb:  Math.round(mem.external  / 1024 / 1024),
      },
    };
  }

  private async _runChecker(checker: CheckerConfig): Promise<CheckResult> {
    const start     = Date.now();
    const timeoutMs = checker.timeoutMs ?? 5000;

    try {
      const details = await withTimeout(
        Promise.resolve(checker.check()),
        timeoutMs,
        checker.name,
      );

      return {
        name:        checker.name,
        status:      "pass",
        criticality: checker.criticality,
        durationMs:  Date.now() - start,
        details:     details as Record<string, unknown>,
        timestamp:   new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        name:        checker.name,
        status:      "fail",
        criticality: checker.criticality,
        durationMs:  Date.now() - start,
        error:       msg,
        timestamp:   new Date().toISOString(),
      };
    }
  }

  private _computeStatus(results: CheckResult[]): HealthStatus {
    const hasCriticalFail = results.some(
      (r) => r.status === "fail" && r.criticality === "critical",
    );
    if (hasCriticalFail) return "unhealthy";

    const hasDegradedFail = results.some(
      (r) => r.status === "fail" && r.criticality === "degraded",
    );
    if (hasDegradedFail) return "degraded";

    return "healthy";
  }

  /** 当前已注册的检查器数量 */
  get checkerCount(): number {
    return this.checkers.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP 路由适配器
// ─────────────────────────────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * 创建标准健康检查 HTTP 处理器。
 *
 * 映射 HTTP 状态码：
 *   - `healthy`   → 200
 *   - `degraded`  → 200（仍可服务，但有告警）
 *   - `unhealthy` → 503
 *
 * @example
 * ```ts
 * import { createHealthHandlers } from "@dream-xi/health";
 *
 * const { handleLive, handleReady, handleStartup } = createHealthHandlers(registry);
 *
 * // 在路由中注册
 * if (path === "/health/live")    return handleLive(req, res);
 * if (path === "/health/ready")   return handleReady(req, res);
 * if (path === "/health/startup") return handleStartup(req, res);
 * ```
 */
export function createHealthHandlers(registry: HealthRegistry): {
  handleLive:    (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleReady:   (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleStartup: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} {
  async function respond(
    res: ServerResponse,
    runFn: () => Promise<HealthReport>,
  ): Promise<void> {
    try {
      const report  = await runFn();
      const status  = report.status === "unhealthy" ? 503 : 200;
      const body    = JSON.stringify(report, null, 2);
      res.writeHead(status, {
        "Content-Type":  "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
      });
      res.end(body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "unhealthy", error: msg }));
    }
  }

  return {
    handleLive:    (_req, res) => respond(res, () => registry.runLiveness()),
    handleReady:   (_req, res) => respond(res, () => registry.runReadiness()),
    handleStartup: (_req, res) => respond(res, () => registry.runStartup()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream XI 默认 Registry 工厂
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建预配置的 Dream XI 健康检查 Registry。
 *
 * 默认注册：
 *   - 内存使用检查（liveness + readiness，阈值 512MB）
 *   - 启动就绪检查（startup，5s 后通过）
 *
 * @example
 * ```ts
 * import { createDreamXiRegistry } from "@dream-xi/health";
 *
 * const registry = createDreamXiRegistry({ version: "1.8.0-alpha" });
 *
 * // 追加业务检查
 * registry.register({
 *   name: "redis",
 *   probe: ["readiness", "liveness"],
 *   criticality: "critical",
 *   check: () => redisClient.ping(),
 * });
 * ```
 */
export function createDreamXiRegistry(options: {
  version: string;
  heapThresholdMb?: number;
  startupUptimeMs?: number;
}): HealthRegistry {
  const registry = new HealthRegistry({
    name:    "dream-xi-ai",
    version: options.version,
  });

  registry
    .registerMemoryCheck({ heapUsedThresholdMb: options.heapThresholdMb ?? 512 })
    .registerStartupCheck({ minUptimeMs: options.startupUptimeMs ?? 5000 });

  return registry;
}

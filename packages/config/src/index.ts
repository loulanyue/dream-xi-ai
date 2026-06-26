/**
 * @dream-xi/config — 配置加载器（Config Loader）入口
 *
 * 统一读取 process.env，组装类型安全的 DreamXiConfig 对象，
 * 并在启动时自动验证配置完整性。
 *
 * 使用方式：
 *   import { loadConfig } from "@dream-xi/config";
 *   const { config, validation } = loadConfig();
 *
 * 参考：.env.example（所有环境变量说明）
 * 参考：SETUP.md § 配置说明
 */

export { ConfigError, readString, requireString, readInt, readBool, readList } from "./env-reader.js";
export { validateConfig, formatValidationReport } from "./validator.js";

import type { DreamXiConfig, PlayerId } from "@dream-xi/types";
import {
  readBool,
  readInt,
  readList,
  readString,
} from "./env-reader.js";
import { validateConfig, formatValidationReport, type ConfigValidationResult } from "./validator.js";

// ─────────────────────────────────────────────────────────────────────────────
// 配置加载结果
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadConfigResult {
  config: DreamXiConfig;
  validation: ConfigValidationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// 主加载函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从 process.env 加载平台完整配置
 *
 * @param options.strict 严格模式：验证失败时抛出错误（默认 true）
 * @param options.printReport 是否打印启动配置报告（默认 true）
 *
 * @example
 * ```ts
 * // 标准用法（严格模式，自动打印报告）
 * const { config, validation } = loadConfig();
 *
 * // 测试用法（宽松模式，不打印）
 * const { config } = loadConfig({ strict: false, printReport: false });
 * ```
 */
export function loadConfig(options: {
  strict?: boolean;
  printReport?: boolean;
} = {}): LoadConfigResult {
  const { strict = true, printReport = true } = options;

  const config = buildConfig();
  const validation = validateConfig(config);

  if (printReport) {
    console.log(formatValidationReport(validation));
  }

  if (strict && !validation.valid) {
    throw new Error(
      `Dream XI 配置验证失败，无法启动。请修复以下错误：\n${validation.errors.map((e) => `  • ${e}`).join("\n")}`,
    );
  }

  return { config, validation };
}

// ─────────────────────────────────────────────────────────────────────────────
// 配置组装（逐节读取）
// ─────────────────────────────────────────────────────────────────────────────

function buildConfig(): DreamXiConfig {
  return {
    server: buildServerConfig(),
    memory: buildMemoryConfig(),
    players: buildPlayerConfigs(),
    integrations: buildIntegrationConfig(),
    mcp: buildMcpConfig(),
    security: buildSecurityConfig(),
    logging: buildLogConfig(),
    fairPlay: buildFairPlayConfig(),
  };
}

function buildServerConfig(): DreamXiConfig["server"] {
  return {
    port: readInt("PORT", 3003),
    nodeEnv: (readString("NODE_ENV") ?? "development") as "development" | "production" | "test",
    baseUrl: readString("BASE_URL") ?? "http://localhost:3003",
  };
}

function buildMemoryConfig(): DreamXiConfig["memory"] {
  const redisUrl = readString("REDIS_URL");
  const backend = redisUrl !== undefined ? "redis" : "memory";

  return {
    backend,
    redisUrl,
    workingMemoryMaxTokens: readInt("WORKING_MEMORY_MAX_TOKENS", 100_000),
    episodicMemoryTtlSeconds: readInt(
      "EPISODIC_MEMORY_TTL_SECONDS",
      backend === "redis" ? 90 * 24 * 3600 : 30 * 24 * 3600,
    ),
    semanticMemoryPath: readString("SEMANTIC_MEMORY_PATH") ?? "./data/semantic",
    identityAnchorInterval: readInt("IDENTITY_ANCHOR_INTERVAL", 10),
  };
}

function buildPlayerConfigs(): DreamXiConfig["players"] {
  const playerEnvMap: Record<PlayerId, string> = {
    leo: "ANTHROPIC_API_KEY",
    andre: "OPENAI_API_KEY",
    flash: "GOOGLE_API_KEY",
    wall: "OPENCODE_DEFAULT_PROVIDER",
    gate: "CUSTOM_LLM_API_KEY",
  };

  const playerModelMap: Record<PlayerId, string> = {
    leo: "claude-opus-4-5",
    andre: "gpt-4o",
    flash: "gemini-2.0-flash",
    wall: "opencode",
    gate: "custom",
  };

  const playerProviderMap: Record<PlayerId, DreamXiConfig["players"][PlayerId] extends undefined ? never : NonNullable<DreamXiConfig["players"][PlayerId]>["provider"]> = {
    leo: "anthropic",
    andre: "openai",
    flash: "google",
    wall: "opencode",
    gate: "custom",
  };

  const configs: DreamXiConfig["players"] = {};

  for (const [playerId, envKey] of Object.entries(playerEnvMap) as Array<[PlayerId, string]>) {
    const apiKey = readString(envKey);
    if (apiKey !== undefined) {
      configs[playerId] = {
        provider: playerProviderMap[playerId],
        apiKey,
        modelId: readString(`${playerId.toUpperCase()}_MODEL_ID`) ?? playerModelMap[playerId],
        baseUrl: readString("CUSTOM_LLM_BASE_URL"),
        timeoutMs: readInt("LLM_TIMEOUT_MS", 60_000),
        maxRetries: readInt("LLM_MAX_RETRIES", 3),
      };
    }
  }

  return configs;
}

function buildIntegrationConfig(): DreamXiConfig["integrations"] {
  const feishuAppId = readString("FEISHU_APP_ID");
  const githubClientId = readString("GITHUB_CLIENT_ID");
  const telegramToken = readString("TELEGRAM_BOT_TOKEN");

  return {
    ...(feishuAppId !== undefined && {
      feishu: {
        enabled: true,
        appId: feishuAppId,
        appSecret: readString("FEISHU_APP_SECRET") ?? "",
        verificationToken: readString("FEISHU_VERIFICATION_TOKEN") ?? "",
        encryptKey: readString("FEISHU_ENCRYPT_KEY") ?? "",
      },
    }),
    ...(telegramToken !== undefined && {
      telegram: {
        enabled: true,
        botToken: telegramToken,
      },
    }),
    ...(githubClientId !== undefined && {
      github: {
        enabled: true,
        clientId: githubClientId,
        clientSecret: readString("GITHUB_CLIENT_SECRET") ?? "",
        webhookSecret: readString("GITHUB_WEBHOOK_SECRET") ?? "",
      },
    }),
  };
}

function buildMcpConfig(): DreamXiConfig["mcp"] {
  return {
    port: readInt("MCP_PORT", 3004),
    callbackTimeoutMs: readInt("MCP_CALLBACK_TIMEOUT", 30_000),
    tools: readList("MCP_ENABLED_TOOLS", ["filesystem", "code-executor"]),
  };
}

function buildSecurityConfig(): DreamXiConfig["security"] {
  return {
    jwtSecret: readString("JWT_SECRET") ?? "change-me-in-production",
    jwtExpiresIn: readString("JWT_EXPIRES_IN") ?? "7d",
    corsOrigins: readList("CORS_ORIGINS", ["http://localhost:3003"]),
  };
}

function buildLogConfig(): DreamXiConfig["logging"] {
  const level = readString("LOG_LEVEL") ?? "info";
  const format = readString("LOG_FORMAT") ?? "pretty";

  return {
    level: level as DreamXiConfig["logging"]["level"],
    format: format as DreamXiConfig["logging"]["format"],
    file: readString("LOG_FILE"),
  };
}

function buildFairPlayConfig(): DreamXiConfig["fairPlay"] {
  return {
    protectPersistentData: readBool("FAIR_PLAY_PROTECT_DATA", true),
    protectParentProcess: readBool("FAIR_PLAY_PROTECT_PROCESS", true),
    enforceReadOnlyConfig: readBool("FAIR_PLAY_READONLY_CONFIG", true),
    enforcePortBoundaries: readBool("FAIR_PLAY_PORT_BOUNDARY", true),
    allowedPorts: [
      readInt("PORT", 3003),
      readInt("MCP_PORT", 3004),
    ],
  };
}

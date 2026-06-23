/**
 * @dream-xi/types — 平台配置（Config）类型定义
 *
 * Dream XI 平台层的完整配置类型，与 .env.example 中的所有环境变量一一对应。
 * 参考：SETUP.md、.env.example
 */

import type { ModelId, ModelProvider, PlayerId } from "./player.js";
import type { MemoryConfig } from "./memory.js";

// ─────────────────────────────────────────────────────────────────────────────
// 服务器配置（Server Config）
// ─────────────────────────────────────────────────────────────────────────────

/** 服务器配置 */
export interface ServerConfig {
  /** 服务监听端口（默认 3003） */
  port: number;
  /** 运行环境 */
  nodeEnv: "development" | "production" | "test";
  /** 服务基础 URL */
  baseUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 模型提供商配置（Provider Config）
// ─────────────────────────────────────────────────────────────────────────────

/** 单个模型提供商配置 */
export interface ProviderConfig {
  /** 提供商类型 */
  provider: ModelProvider;
  /** API Key */
  apiKey: string;
  /** 使用的模型 ID */
  modelId: ModelId;
  /** 自定义 API Base URL（用于 OpenAI 兼容接口） */
  baseUrl?: string;
  /** 请求超时（毫秒） */
  timeoutMs?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

/** 所有球员的模型配置 */
export type PlayerProviderConfigs = Partial<Record<PlayerId, ProviderConfig>>;

// ─────────────────────────────────────────────────────────────────────────────
// 平台集成配置（Integration Config）
// ─────────────────────────────────────────────────────────────────────────────

/** 飞书集成配置 */
export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string;
}

/** Telegram 集成配置 */
export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
}

/** GitHub 集成配置 */
export interface GitHubConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

/** 平台集成配置汇总 */
export interface IntegrationConfig {
  feishu?: FeishuConfig;
  telegram?: TelegramConfig;
  github?: GitHubConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP 配置（MCP Config）
// ─────────────────────────────────────────────────────────────────────────────

/** MCP（Model Context Protocol）配置 */
export interface McpConfig {
  /** MCP 服务器监听端口 */
  port: number;
  /** Callback Bridge 超时（毫秒） */
  callbackTimeoutMs: number;
  /** 已注册的 MCP 工具列表 */
  tools: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 安全配置（Security Config）
// ─────────────────────────────────────────────────────────────────────────────

/** 安全配置 */
export interface SecurityConfig {
  /** JWT 签名密钥 */
  jwtSecret: string;
  /** JWT 有效期（ms 格式） */
  jwtExpiresIn: string;
  /** CORS 允许的来源列表 */
  corsOrigins: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 日志配置（Log Config）
// ─────────────────────────────────────────────────────────────────────────────

/** 日志配置 */
export interface LogConfig {
  /** 日志级别 */
  level: "error" | "warn" | "info" | "debug" | "trace";
  /** 日志格式 */
  format: "json" | "pretty";
  /** 日志文件路径（undefined 表示仅控制台输出） */
  file?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 球队铁律配置（Fair Play Rules Config）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 球队铁律约束配置
 * 对应 docs/ARCHITECTURE.md § ADR-005
 */
export interface FairPlayConfig {
  /** 是否启用数据圣殿保护（禁止删除持久化存储） */
  protectPersistentData: boolean;
  /** 是否启用进程自保（禁止杀死父进程） */
  protectParentProcess: boolean;
  /** 是否启用配置只读（禁止修改运行时配置） */
  enforceReadOnlyConfig: boolean;
  /** 是否启用端口边界（禁止跨服务访问端口） */
  enforcePortBoundaries: boolean;
  /** 允许访问的端口白名单 */
  allowedPorts: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 完整平台配置（Dream XI Platform Config）
// ─────────────────────────────────────────────────────────────────────────────

/** Dream XI 平台完整配置 */
export interface DreamXiConfig {
  server: ServerConfig;
  memory: MemoryConfig;
  players: PlayerProviderConfigs;
  integrations: IntegrationConfig;
  mcp: McpConfig;
  security: SecurityConfig;
  logging: LogConfig;
  fairPlay: FairPlayConfig;
}

/** 配置验证结果 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** 已配置的球员列表 */
  configuredPlayers: PlayerId[];
  /** 缺失 API Key 的球员列表（在替补席） */
  benchedPlayers: PlayerId[];
}

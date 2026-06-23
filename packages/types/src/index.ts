/**
 * @dream-xi/types
 *
 * Dream XI AI 核心 TypeScript 类型定义包
 *
 * 导出所有核心类型，供平台层各包使用。
 *
 * @example
 * ```ts
 * import type { PlayerDefinition, Message, DreamXiConfig } from "@dream-xi/types";
 * ```
 */

// 球员类型
export type {
  PlayerNumber,
  PlayerId,
  PlayerPosition,
  ModelProvider,
  ModelId,
  PlayerStatus,
  PlayerCapability,
  PlayerDefinition,
  PlayerState,
} from "./player.js";
export { PLAYER_DEFINITIONS } from "./player.js";

// A2A 消息类型
export type {
  MessageId,
  ThreadId,
  MessageSource,
  MessageKind,
  TextBlock,
  CodeBlock,
  DiffBlock,
  ReviewFinding,
  ReviewBlock,
  HandoffBlock,
  ChecklistBlock,
  ContentBlock,
  MessageRouting,
  Message,
  ThreadStatus,
  Thread,
} from "./message.js";

// 记忆类型
export type {
  MemoryId,
  MemoryLayer,
  MemoryEntry,
  EpisodicMemoryEntry,
  SemanticMemoryEntry,
  IdentityAnchor,
  MemoryConfig,
} from "./memory.js";

// 战术类型
export type {
  TacticId,
  SemVer,
  TacticCategory,
  TacticTrigger,
  TacticDefinition,
  TacticLoadState,
  BuiltinTacticId,
} from "./tactic.js";
export { BUILTIN_TACTIC_IDS } from "./tactic.js";

// 平台配置类型
export type {
  ServerConfig,
  ProviderConfig,
  PlayerProviderConfigs,
  FeishuConfig,
  TelegramConfig,
  GitHubConfig,
  IntegrationConfig,
  McpConfig,
  SecurityConfig,
  LogConfig,
  FairPlayConfig,
  DreamXiConfig,
  ConfigValidationResult,
} from "./config.js";

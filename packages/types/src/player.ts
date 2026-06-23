/**
 * @dream-xi/types — 球员（Player）类型定义
 *
 * 球员是 Dream XI 球队的核心实体。每名球员对应一个 AI Agent，
 * 拥有固定的位置、个性、职责和专属颜色。
 */

// ─────────────────────────────────────────────────────────────────────────────
// 球员编号（Jersey Number）
// ─────────────────────────────────────────────────────────────────────────────

/** 球衣编号，与 docs/GLOSSARY.md 中的球员编号对照表一一对应 */
export type PlayerNumber = 1 | 4 | 8 | 9 | 10;

/** 球员 ID（唯一标识符，用于路由和 @mention） */
export type PlayerId = "leo" | "andre" | "flash" | "wall" | "gate";

// ─────────────────────────────────────────────────────────────────────────────
// 球员位置（Position）
// ─────────────────────────────────────────────────────────────────────────────

/** 球场位置 */
export type PlayerPosition =
  | "captain"     // #10 队长 — 组织核心
  | "midfielder"  // #8 中场 — 引擎
  | "striker"     // #9 前锋 — 射手
  | "defender"    // #4 后卫 — 磐石
  | "goalkeeper"; // #1 门将 — 质量门禁

// ─────────────────────────────────────────────────────────────────────────────
// 模型提供商（Model Provider）
// ─────────────────────────────────────────────────────────────────────────────

/** 支持的 AI 模型提供商 */
export type ModelProvider =
  | "anthropic"   // Claude (Opus / Sonnet / Haiku)
  | "openai"      // GPT / Codex
  | "google"      // Gemini
  | "opencode"    // opencode (多模型)
  | "moonshot"    // Kimi
  | "zhipu"       // 智谱 GLM
  | "minimax"     // MiniMax
  | "custom";     // 自定义 OpenAI 兼容接口

/** 模型标识符，例如 "claude-opus-4-5"、"gpt-4o"、"gemini-2.0-flash" */
export type ModelId = string;

// ─────────────────────────────────────────────────────────────────────────────
// 球员状态（Player Status）
// ─────────────────────────────────────────────────────────────────────────────

/** 球员当前上场状态 */
export type PlayerStatus =
  | "active"    // 在场 — 可接球
  | "busy"      // 处理中 — 正在跑位
  | "idle"      // 待命 — 等待指令
  | "benched"   // 替补席 — 未配置 API Key
  | "offline";  // 离线 — 服务不可用

// ─────────────────────────────────────────────────────────────────────────────
// 球员定义（Player Definition）
// ─────────────────────────────────────────────────────────────────────────────

/** 球员能力标签 */
export type PlayerCapability =
  | "architecture"    // 架构设计
  | "code-review"     // 代码审查
  | "security"        // 安全分析
  | "testing"         // 测试
  | "design"          // 创意设计
  | "prototyping"     // 快速原型
  | "infrastructure"  // 基础设施
  | "reasoning"       // 复杂推理
  | "writing"         // 文档写作
  | "data-analysis";  // 数据分析

/** 球员静态定义（不随状态变化） */
export interface PlayerDefinition {
  /** 球员 ID，用于 @mention 路由 */
  id: PlayerId;
  /** 球衣号码 */
  number: PlayerNumber;
  /** 中文名 */
  nameZh: string;
  /** 英文名 */
  nameEn: string;
  /** 球场位置 */
  position: PlayerPosition;
  /** 绑定的模型提供商 */
  provider: ModelProvider;
  /** 专属颜色（来自 docs/design-system.md） */
  color: string;
  /** 职责描述 */
  description: string;
  /** 球员能力标签 */
  capabilities: PlayerCapability[];
  /** 个性关键词（用于身份锚定） */
  personality: string[];
}

/** 球员运行时状态（随会话变化） */
export interface PlayerState {
  definition: PlayerDefinition;
  /** 当前上场状态 */
  status: PlayerStatus;
  /** 使用的模型 ID */
  modelId: ModelId;
  /** 上下文窗口已用 Token 数 */
  tokensUsed: number;
  /** 上下文窗口最大 Token 数 */
  tokensLimit: number;
  /** 已加载的战术列表 */
  loadedTactics: string[];
  /** 最后活动时间 */
  lastActiveAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// 预定义球员（内置四名球员 + 门将）
// ─────────────────────────────────────────────────────────────────────────────

/** 球员角色常量，与 AGENTS.md 中的定义保持一致 */
export const PLAYER_DEFINITIONS: Record<PlayerId, Omit<PlayerDefinition, "id">> = {
  leo: {
    number: 10,
    nameZh: "里奥 Leo",
    nameEn: "Leo",
    position: "captain",
    provider: "anthropic",
    color: "#7B1FA2",
    description: "组织核心，战术大脑。架构设计、复杂推理、战术规划。",
    capabilities: ["architecture", "reasoning", "writing", "code-review"],
    personality: ["strategic", "precise", "visionary", "calm"],
  },
  andre: {
    number: 8,
    nameZh: "安德 André",
    nameEn: "André",
    position: "midfielder",
    provider: "openai",
    color: "#1565C0",
    description: "中场引擎，代码审查专家。安全分析、测试覆盖、跨模型审查。",
    capabilities: ["code-review", "security", "testing", "data-analysis"],
    personality: ["reliable", "thorough", "analytical", "steady"],
  },
  flash: {
    number: 9,
    nameZh: "弗拉什 Flash",
    nameEn: "Flash",
    position: "striker",
    provider: "google",
    color: "#FF6F00",
    description: "灵感火花，快速创意。设计方案生成、原型构建、快速迭代。",
    capabilities: ["design", "prototyping", "writing", "reasoning"],
    personality: ["creative", "fast", "bold", "energetic"],
  },
  wall: {
    number: 4,
    nameZh: "沃尔 Wall",
    nameEn: "Wall",
    position: "defender",
    provider: "opencode",
    color: "#2E7D32",
    description: "稳固磐石，多位置适配。基础设施、兜底执行、任何模型。",
    capabilities: ["infrastructure", "testing", "code-review", "architecture"],
    personality: ["solid", "disciplined", "versatile", "dependable"],
  },
  gate: {
    number: 1,
    nameZh: "门将",
    nameEn: "Quality Gate",
    position: "goalkeeper",
    provider: "custom",
    color: "#D4AF37",
    description: "质量门禁层，最后一道防线。自动化检查、安全扫描、合规验证。",
    capabilities: ["testing", "security", "infrastructure"],
    personality: ["strict", "impartial", "automated"],
  },
} as const;

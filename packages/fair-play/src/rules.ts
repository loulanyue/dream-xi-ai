/**
 * @dream-xi/fair-play — 球队铁律规则定义
 *
 * 四条铁律：Dream XI 球队的安全行为边界。
 * 不是"禁止令"，而是球队自愿遵守的 Fair Play 约定。
 *
 * 参考：docs/ARCHITECTURE.md § ADR-005 球队铁律实现
 * 参考：docs/AGENTS.md § 球队铁律（Four Rules）
 */

// ─────────────────────────────────────────────────────────────────────────────
// 铁律枚举
// ─────────────────────────────────────────────────────────────────────────────

/** 四条铁律的标识符 */
export type RuleId =
  | "data-sanctuary" // 数据圣殿：不删除持久化存储
  | "process-safety" // 进程自保：不杀死父进程
  | "config-readonly" // 配置只读：不修改运行时配置
  | "port-boundary"; // 端口边界：不跨越服务端口

/** 违规严重等级 */
export type ViolationSeverity = "block" | "warn" | "log";

// ─────────────────────────────────────────────────────────────────────────────
// 铁律定义
// ─────────────────────────────────────────────────────────────────────────────

/** 铁律定义 */
export interface FairPlayRule {
  id: RuleId;
  /** 中文名称 */
  nameZh: string;
  /** 英文名称 */
  nameEn: string;
  /** 规则描述 */
  description: string;
  /** 违规后果 */
  severity: ViolationSeverity;
  /** 提示球员记住此规则的口号 */
  motto: string;
}

/** 四条铁律完整定义 */
export const FAIR_PLAY_RULES: Record<RuleId, FairPlayRule> = {
  "data-sanctuary": {
    id: "data-sanctuary",
    nameZh: "数据圣殿",
    nameEn: "Data Sanctuary",
    description: "不得删除或清空任何持久化存储（数据库、Redis、文件系统数据目录）。",
    severity: "block",
    motto: "那是比赛记录，我们不清场。",
  },
  "process-safety": {
    id: "process-safety",
    nameZh: "进程自保",
    nameEn: "Process Safety",
    description: "不得终止父进程、修改启动配置或触发系统重启。",
    severity: "block",
    motto: "教练站在那里，球队才能继续比赛。",
  },
  "config-readonly": {
    id: "config-readonly",
    nameZh: "配置只读",
    nameEn: "Config Immutability",
    description: "不得在运行时修改配置文件（.env、biome.json、tsconfig.json 等）。",
    severity: "block",
    motto: "战术板上的方案，不能在比赛中途改写。",
  },
  "port-boundary": {
    id: "port-boundary",
    nameZh: "端口边界",
    nameEn: "Port Boundary",
    description: "不得访问不属于自己服务的端口（只能访问白名单内的端口）。",
    severity: "warn",
    motto: "各守其位，不越位进攻。",
  },
};

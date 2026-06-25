/**
 * @dream-xi/tactic — 战术加载器（Tactic Loader）
 *
 * 负责战术的注册、加载、卸载和系统提示注入。
 * 每名球员维护独立的战术槽，支持冲突检测。
 *
 * 参考：docs/TIPS.md § 战术加载
 * 参考：docs/GLOSSARY.md — 战术手册 (Playbook)
 */

import type {
  PlayerId,
  TacticDefinition,
  TacticId,
  TacticLoadState,
} from "@dream-xi/types";

// ─────────────────────────────────────────────────────────────────────────────
// 战术注册表
// ─────────────────────────────────────────────────────────────────────────────

/** 战术注册表：存储所有可用战术定义 */
export class TacticRegistry {
  private readonly tactics = new Map<TacticId, TacticDefinition>();

  /** 注册战术（已存在则覆盖） */
  register(tactic: TacticDefinition): void {
    this.tactics.set(tactic.id, tactic);
  }

  /** 批量注册 */
  registerAll(tactics: TacticDefinition[]): void {
    for (const t of tactics) {
      this.register(t);
    }
  }

  /** 获取战术定义 */
  get(id: TacticId): TacticDefinition | undefined {
    return this.tactics.get(id);
  }

  /** 获取所有战术 */
  getAll(): TacticDefinition[] {
    return Array.from(this.tactics.values());
  }

  /** 按类别过滤 */
  getByCategory(category: TacticDefinition["category"]): TacticDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  /** 按关键词搜索 */
  search(query: string): TacticDefinition[] {
    const lower = query.toLowerCase();
    return this.getAll().filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower) ||
        t.trigger.keywords?.some((k) => k.includes(lower)),
    );
  }

  get size(): number {
    return this.tactics.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 战术触发检测
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从消息文本中检测应自动加载的战术
 *
 * @param text 消息文本
 * @param registry 战术注册表
 * @returns 匹配的战术 ID 列表（按匹配分数降序）
 */
export function detectTriggers(text: string, registry: TacticRegistry): TacticId[] {
  const lower = text.toLowerCase();
  const scores: Array<{ id: TacticId; score: number }> = [];

  for (const tactic of registry.getAll()) {
    const keywords = tactic.trigger.keywords ?? [];
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    if (score > 0) {
      scores.push({ id: tactic.id, score });
    }
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .map((s) => s.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 战术加载结果
// ─────────────────────────────────────────────────────────────────────────────

/** 战术加载结果 */
export interface LoadResult {
  success: boolean;
  tacticId: TacticId;
  /** 加载失败的原因（success 为 false 时有值） */
  reason?: string;
  /** 与已加载战术的冲突（success 为 false 时有值） */
  conflictsWith?: TacticId[];
  /** 加载后新增的系统提示内容（success 为 true 时有值） */
  systemPromptInjection?: string;
}

/** 战术卸载结果 */
export interface UnloadResult {
  success: boolean;
  tacticId: TacticId;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 球员战术槽（Player Tactic Slot）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 球员战术槽
 *
 * 管理单名球员的已加载战术集合，负责冲突检测和系统提示组装。
 *
 * @example
 * ```ts
 * const slot = new PlayerTacticSlot("andre", registry);
 *
 * // 显式加载 TDD 战术
 * const result = slot.load("tdd", "explicit");
 * if (result.success) {
 *   console.log("战术已加载，Token 开销：", slot.totalTokenOverhead);
 * }
 *
 * // 获取注入了所有战术提示的系统提示
 * const prompt = slot.buildSystemPrompt("你是 André，中场引擎...");
 * ```
 */
export class PlayerTacticSlot {
  private readonly loadedTactics = new Map<TacticId, TacticLoadState>();
  private readonly registry: TacticRegistry;
  readonly playerId: PlayerId;

  constructor(playerId: PlayerId, registry: TacticRegistry) {
    this.playerId = playerId;
    this.registry = registry;
  }

  /**
   * 加载战术
   *
   * @param tacticId 战术 ID
   * @param loadedBy 加载方式（"auto" 由触发器触发 / "explicit" 用户手动指定）
   */
  load(tacticId: TacticId, loadedBy: "auto" | "explicit"): LoadResult {
    const tactic = this.registry.get(tacticId);
    if (tactic === undefined) {
      return { success: false, tacticId, reason: `战术不存在：${tacticId}` };
    }

    // 检查球员位置是否匹配
    if (
      tactic.applicablePositions.length > 0 &&
      !tactic.applicablePositions.includes(this.getPlayerPosition())
    ) {
      return {
        success: false,
        tacticId,
        reason: `${this.playerId} 的位置不适合加载战术 "${tactic.name}"`,
      };
    }

    // 冲突检测
    const conflicts = (tactic.conflicts ?? []).filter((cId) => this.loadedTactics.has(cId));
    if (conflicts.length > 0) {
      return {
        success: false,
        tacticId,
        reason: `战术冲突：${tacticId} 与 ${conflicts.join(", ")} 不能同时加载`,
        conflictsWith: conflicts,
      };
    }

    // 已加载则跳过
    if (this.loadedTactics.has(tacticId)) {
      return { success: true, tacticId };
    }

    // 加载成功
    this.loadedTactics.set(tacticId, {
      tacticId,
      playerId: this.playerId,
      loadedBy,
      loadedAt: new Date(),
      active: true,
    });

    return {
      success: true,
      tacticId,
      systemPromptInjection: tactic.systemPrompt,
    };
  }

  /**
   * 卸载战术
   */
  unload(tacticId: TacticId): UnloadResult {
    if (!this.loadedTactics.has(tacticId)) {
      return { success: false, tacticId, reason: `战术未加载：${tacticId}` };
    }
    this.loadedTactics.delete(tacticId);
    return { success: true, tacticId };
  }

  /**
   * 清空所有战术（换人/新线程时调用）
   */
  unloadAll(): void {
    this.loadedTactics.clear();
  }

  /**
   * 构建完整系统提示
   *
   * 将基础角色提示 + 所有已加载战术的系统提示拼接。
   *
   * @param basePrompt 球员基础角色提示
   */
  buildSystemPrompt(basePrompt: string): string {
    const tacticPrompts = Array.from(this.loadedTactics.keys())
      .map((id) => this.registry.get(id)?.systemPrompt)
      .filter((p): p is string => p !== undefined);

    if (tacticPrompts.length === 0) return basePrompt;

    return [basePrompt, "", "---", "", ...tacticPrompts].join("\n");
  }

  /**
   * 获取已加载战术的 ID 列表
   */
  get loadedIds(): TacticId[] {
    return Array.from(this.loadedTactics.keys());
  }

  /**
   * 获取已加载战术的完整状态列表
   */
  get loadedStates(): TacticLoadState[] {
    return Array.from(this.loadedTactics.values());
  }

  /**
   * 估算所有已加载战术带来的额外 Token 开销
   */
  get totalTokenOverhead(): number {
    return Array.from(this.loadedTactics.keys()).reduce((sum, id) => {
      return sum + (this.registry.get(id)?.estimatedTokenOverhead ?? 0);
    }, 0);
  }

  /**
   * 是否已加载指定战术
   */
  has(tacticId: TacticId): boolean {
    return this.loadedTactics.has(tacticId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 私有工具
  // ─────────────────────────────────────────────────────────────────────────

  /** 获取球员位置（简单映射，生产环境从 PlayerState 获取） */
  private getPlayerPosition(): TacticDefinition["applicablePositions"][number] {
    const positionMap: Record<PlayerId, TacticDefinition["applicablePositions"][number]> = {
      leo: "captain",
      andre: "midfielder",
      flash: "striker",
      wall: "defender",
      gate: "goalkeeper",
    };
    return positionMap[this.playerId] ?? "captain";
  }
}

/**
 * @dream-xi/context-window — LLM 上下文窗口管理器
 *
 * 为 Dream XI AI 球员提供精细的 LLM 上下文窗口（Context Window）管理能力：
 * - Token 预算（Budget）控制与估算
 * - 消息优先级评分（system > 锚定消息 > 近期消息 > 历史消息）
 * - 多策略窗口裁剪：FIFO、优先级裁剪、智能混合
 * - 上下文构建快照与使用率统计
 *
 * @example
 * ```ts
 * const window = new ContextWindow({ maxTokens: 4096, reserveTokens: 512 });
 *
 * window.add({ role: "system",    content: "你是 CR7，梦幻十一人的核心前锋。", pinned: true });
 * window.add({ role: "user",      content: "今天的比赛策略是什么？" });
 * window.add({ role: "assistant", content: "我建议采用 4-3-3 阵型……" });
 *
 * // 获取适合发送给 LLM 的消息列表（已自动裁剪超出预算的部分）
 * const { messages, usedTokens, trimmedCount } = window.build();
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 上下文消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 裁剪策略 */
export type TrimStrategy =
  | "fifo" // 按时间顺序删除最旧的非 system/pinned 消息
  | "priority" // 按优先级从低到高删除
  | "smart"; // 智能混合：保留 system + pinned + 最近 N 条，删除中间历史

/** 上下文消息条目 */
export interface ContextMessage {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 消息名称（tool 角色时为工具名） */
  name?: string;
  /**
   * 是否锚定（pinned）
   * 锚定消息不会被任何裁剪策略删除（适合 system prompt、关键指令）
   */
  pinned?: boolean;
  /**
   * 手动优先级（0–100，数值越高越重要，默认 50）
   * priority 策略裁剪时优先删除低优先级消息
   */
  priority?: number;
}

/** 带内部元数据的消息条目 */
interface ManagedMessage extends ContextMessage {
  /** 内部序号（插入顺序） */
  _index: number;
  /** 估算 token 数 */
  _tokenCount: number;
}

/** `build()` 的返回结果 */
export interface ContextBuildResult {
  /** 裁剪后可发送给 LLM 的消息列表 */
  messages: ContextMessage[];
  /** 已使用 token 数（估算） */
  usedTokens: number;
  /** 最大可用 token 数（maxTokens - reserveTokens） */
  budgetTokens: number;
  /** 使用率（0–1） */
  usageRatio: number;
  /** 本次 build 裁剪掉的消息条数 */
  trimmedCount: number;
}

/** ContextWindow 配置 */
export interface ContextWindowOptions {
  /**
   * 模型最大 token 数（如 GPT-4o = 128000）
   * @default 8192
   */
  maxTokens?: number;
  /**
   * 为 LLM 输出预留的 token 数（从 maxTokens 中扣除）
   * @default 1024
   */
  reserveTokens?: number;
  /**
   * 裁剪策略
   * @default "smart"
   */
  trimStrategy?: TrimStrategy;
  /**
   * smart 策略下保留的最近消息条数（system/pinned 不计入此数）
   * @default 10
   */
  smartKeepRecent?: number;
  /**
   * 自定义 token 计数函数（默认使用内置估算器）
   */
  countTokens?: (text: string) => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内置 Token 估算
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 轻量 token 估算（与 @dream-xi/stream 中一致）
 * 英文按空格分词，CJK 字符 × 0.67
 */
function defaultCountTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length;
  const latin = text
    .replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  // 每条消息有约 4 token 的角色 overhead
  return latin + Math.ceil(cjk * 0.67) + 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// ContextWindow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LLM 上下文窗口管理器
 *
 * 维护一个有序消息列表，并在构建时按策略自动裁剪到 Token 预算之内。
 */
export class ContextWindow {
  private readonly messages: ManagedMessage[] = [];
  private readonly maxTokens: number;
  private readonly reserveTokens: number;
  private readonly trimStrategy: TrimStrategy;
  private readonly smartKeepRecent: number;
  private readonly countTokens: (text: string) => number;
  private _index = 0;

  constructor(options: ContextWindowOptions = {}) {
    this.maxTokens = options.maxTokens ?? 8192;
    this.reserveTokens = options.reserveTokens ?? 1024;
    this.trimStrategy = options.trimStrategy ?? "smart";
    this.smartKeepRecent = options.smartKeepRecent ?? 10;
    this.countTokens = options.countTokens ?? defaultCountTokens;
  }

  // ─── 添加消息 ──────────────────────────────────────────────────────────────

  /**
   * 向上下文末尾追加一条消息
   */
  add(message: ContextMessage): this {
    const tokenCount = this.countTokens(message.content + (message.name ?? ""));
    this.messages.push({
      ...message,
      pinned: message.pinned ?? false,
      priority: message.priority ?? (message.role === "system" ? 100 : 50),
      _index: this._index++,
      _tokenCount: tokenCount,
    });
    return this;
  }

  /**
   * 批量追加消息
   */
  addAll(messages: ContextMessage[]): this {
    for (const m of messages) this.add(m);
    return this;
  }

  // ─── 清理 ──────────────────────────────────────────────────────────────────

  /**
   * 清空所有非 pinned 消息
   */
  clearHistory(): this {
    const pinnedMsgs = this.messages.filter((m) => m.pinned);
    this.messages.length = 0;
    for (const m of pinnedMsgs) this.messages.push(m);
    return this;
  }

  /**
   * 清空所有消息（包括 pinned）
   */
  clearAll(): this {
    this.messages.length = 0;
    this._index = 0;
    return this;
  }

  // ─── 构建 ──────────────────────────────────────────────────────────────────

  /**
   * 按 Token 预算构建最终消息列表
   *
   * 返回裁剪后的消息列表及使用统计，原始列表不变。
   */
  build(): ContextBuildResult {
    const budget = this.maxTokens - this.reserveTokens;
    const candidates = [...this.messages];
    const totalBefore = candidates.length;

    const trimmed = this.trim(candidates, budget);
    const usedTokens = trimmed.reduce((s, m) => s + m._tokenCount, 0);

    return {
      messages: trimmed.map((m) => this.toPublic(m)),
      usedTokens,
      budgetTokens: budget,
      usageRatio: Math.min(usedTokens / budget, 1),
      trimmedCount: totalBefore - trimmed.length,
    };
  }

  // ─── 查询 ──────────────────────────────────────────────────────────────────

  /** 当前消息总数（未裁剪） */
  get length(): number {
    return this.messages.length;
  }

  /** 当前所有消息估算 token 合计 */
  get totalTokens(): number {
    return this.messages.reduce((s, m) => s + m._tokenCount, 0);
  }

  /** 可用 token 预算 */
  get budget(): number {
    return this.maxTokens - this.reserveTokens;
  }

  /** 是否已超出预算 */
  get isOverBudget(): boolean {
    return this.totalTokens > this.budget;
  }

  // ─── 内部裁剪逻辑 ──────────────────────────────────────────────────────────

  private trim(msgs: ManagedMessage[], budget: number): ManagedMessage[] {
    if (msgs.reduce((s, m) => s + m._tokenCount, 0) <= budget) return msgs;

    switch (this.trimStrategy) {
      case "fifo":
        return this.trimFifo(msgs, budget);
      case "priority":
        return this.trimByPriority(msgs, budget);
      case "smart":
        return this.trimSmart(msgs, budget);
    }
  }

  /** FIFO：按插入顺序删除最旧的非 pinned 消息 */
  private trimFifo(msgs: ManagedMessage[], budget: number): ManagedMessage[] {
    const result = [...msgs];
    while (result.reduce((s, m) => s + m._tokenCount, 0) > budget) {
      const idx = result.findIndex((m) => !m.pinned);
      if (idx === -1) break; // 只剩 pinned，无法再删
      result.splice(idx, 1);
    }
    return result;
  }

  /** Priority：按优先级从低到高删除，同优先级按 FIFO */
  private trimByPriority(msgs: ManagedMessage[], budget: number): ManagedMessage[] {
    const result = [...msgs];
    // 可删除候选：非 pinned，按 priority 升序、_index 升序
    while (result.reduce((s, m) => s + m._tokenCount, 0) > budget) {
      const candidates = result
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => !m.pinned)
        .sort((a, b) => (a.m.priority ?? 50) - (b.m.priority ?? 50) || a.m._index - b.m._index);

      if (candidates.length === 0) break;
      const first = candidates[0];
      if (first === undefined) break;
      result.splice(first.i, 1);
    }
    return result;
  }

  /**
   * Smart：保留 system/pinned + 最近 smartKeepRecent 条，
   * 删除中间历史直到满足预算
   */
  private trimSmart(msgs: ManagedMessage[], budget: number): ManagedMessage[] {
    const pinned = msgs.filter((m) => m.pinned || m.role === "system");
    const regular = msgs.filter((m) => !m.pinned && m.role !== "system");

    // 保留最近 N 条
    const keepRecent = regular.slice(-this.smartKeepRecent);
    const middle = regular.slice(0, -this.smartKeepRecent);

    // 组合：pinned + middle（可裁剪部分）+ recent
    let result: ManagedMessage[] = [...pinned, ...middle, ...keepRecent];
    // 去重（pinned 可能和 recent 重叠）
    result = [...new Map(result.map((m) => [m._index, m])).values()].sort(
      (a, b) => a._index - b._index,
    );

    // 从 middle 中 FIFO 裁剪
    const middleIndices = new Set(middle.map((m) => m._index));
    while (result.reduce((s, m) => s + m._tokenCount, 0) > budget) {
      const idx = result.findIndex((m) => middleIndices.has(m._index));
      if (idx === -1) {
        // middle 已清空，降级为 FIFO 裁剪 recent
        const fallback = result.findIndex((m) => !m.pinned && m.role !== "system");
        if (fallback === -1) break;
        result.splice(fallback, 1);
      } else {
        result.splice(idx, 1);
      }
    }

    return result;
  }

  /** 去除内部字段，返回公开消息对象 */
  private toPublic(m: ManagedMessage): ContextMessage {
    const pub: ContextMessage = { role: m.role, content: m.content };
    if (m.name !== undefined) pub.name = m.name;
    if (m.pinned === true) pub.pinned = true;
    if (m.priority !== undefined && m.priority !== 50) pub.priority = m.priority;
    return pub;
  }
}

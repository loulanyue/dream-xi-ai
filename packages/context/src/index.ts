/**
 * @dream-xi/context — LLM Agent 对话上下文管理器
 *
 * 为 Dream XI AI 中的每个 Agent 提供精确的上下文生命周期管理：
 *
 *   - **Token 预算控制**：跟踪累计 token 用量，超出预算前触发压缩/裁剪
 *   - **滑动窗口**：保留最近 N 条消息，自动淘汰老旧轮次
 *   - **消息角色**：`system` / `user` / `assistant` / `tool`，符合 OpenAI / Anthropic 格式
 *   - **消息压缩**：可插拔 `Compressor` 接口，内置"摘要截断"策略
 *   - **快照/恢复**：`snapshot()` / `restore(snapshot)` 支持上下文回滚
 *   - **元数据**：每条消息可附带任意 `metadata`（如来源 Agent、轮次 ID）
 *   - **零依赖**：纯 TypeScript，无任何运行时依赖
 *
 * @example
 * ```ts
 * import { ContextWindow } from "@dream-xi/context";
 *
 * const ctx = new ContextWindow({
 *   maxTokens:  8000,
 *   maxMessages: 20,
 *   systemPrompt: "你是 Dream XI AI 的战术分析师。",
 * });
 *
 * ctx.addUser("分析一下本场比赛的攻防表现");
 * ctx.addAssistant("本场比赛控球率 63%，进攻成功率...");
 *
 * const messages = ctx.toMessages(); // 传给 LLM API
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 消息角色（兼容 OpenAI / Anthropic 格式） */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 单条对话消息 */
export interface Message {
  /** 消息唯一 ID */
  id: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 预估 token 数（由调用方传入或由内置估算器计算） */
  tokens: number;
  /** 消息创建时间戳（Unix ms） */
  createdAt: number;
  /** 附加元数据（不参与 token 计算） */
  metadata?: Record<string, unknown>;
}

/** `ContextWindow` 构造选项 */
export interface ContextWindowOptions {
  /**
   * Token 上限。超出后触发压缩/裁剪。
   * @default 8000
   */
  maxTokens?: number;
  /**
   * 最大保留消息条数（含 system）。超出后从最旧的非 system 消息开始删除。
   * @default 50
   */
  maxMessages?: number;
  /**
   * 系统提示词（固定置于消息列表首位，不参与裁剪）。
   */
  systemPrompt?: string;
  /**
   * 系统提示词的预估 token 数。
   * 未提供时使用内置估算器（按字符数 / 4 估算）。
   */
  systemTokens?: number;
  /**
   * 可插拔消息压缩器。
   * 当 token 超出预算时调用，返回压缩后的消息列表。
   */
  compressor?: Compressor;
  /**
   * 自定义 token 估算函数。
   * @default chars / 4（英文约 4 字符/token，中文约 1.5 字符/token，取均值）
   */
  tokenEstimator?: (text: string) => number;
}

/** 上下文快照（用于 rollback） */
export interface ContextSnapshot {
  messages: Message[];
  totalTokens: number;
  createdAt: number;
}

/** 上下文统计信息 */
export interface ContextStats {
  /** 当前消息总数（含 system） */
  messageCount: number;
  /** 当前累计 token 数 */
  totalTokens: number;
  /** Token 预算上限 */
  maxTokens: number;
  /** Token 使用率（0-1） */
  utilization: number;
  /** 是否超出预算 */
  overBudget: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 压缩器接口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 可插拔消息压缩器接口。
 * 当 token 超出预算时，`ContextWindow` 调用此接口压缩消息列表。
 */
export interface Compressor {
  /**
   * @param messages 当前消息列表（不含 system）
   * @param budget   剩余 token 预算
   * @returns 压缩后的消息列表
   */
  compress(messages: Message[], budget: number): Message[] | Promise<Message[]>;
}

/**
 * 内置截断压缩器：从最旧的非 system 消息开始删除，直到满足 budget。
 * 这是最简单、最安全的兜底策略。
 */
export class TruncateCompressor implements Compressor {
  compress(messages: Message[], budget: number): Message[] {
    const result = [...messages];
    while (result.length > 0) {
      const total = result.reduce((s, m) => s + m.tokens, 0);
      if (total <= budget) break;
      result.shift(); // 删除最旧的一条
    }
    return result;
  }
}

/**
 * 保留首尾压缩器：保留最旧的 K 条和最新的 K 条，中间部分用占位符替换。
 * 适合需要同时保留任务背景和最近轮次的场景。
 */
export class HeadTailCompressor implements Compressor {
  constructor(
    /** 保留头部消息数 */
    private readonly headCount: number = 2,
    /** 保留尾部消息数 */
    private readonly tailCount: number = 6,
  ) {}

  compress(messages: Message[], budget: number): Message[] {
    if (messages.length <= this.headCount + this.tailCount) return messages;

    const head = messages.slice(0, this.headCount);
    const tail = messages.slice(messages.length - this.tailCount);
    const omitted = messages.length - this.headCount - this.tailCount;

    const placeholder: Message = {
      id: `placeholder-${Date.now()}`,
      role: "assistant",
      content: `[已省略 ${omitted} 条历史消息以节省上下文空间]`,
      tokens: 10,
      createdAt: Date.now(),
    };

    const result = [...head, placeholder, ...tail];
    // 如果仍然超出 budget，再做一次截断兜底
    const total = result.reduce((s, m) => s + m.tokens, 0);
    if (total > budget) {
      return new TruncateCompressor().compress(result, budget);
    }
    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token 估算器
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 内置 token 估算器。
 * 规则：ASCII 字符 4 个/token；CJK 字符（中日韩）1.5 个/token。
 * 这是粗略估算，精确计数需接入 tiktoken 或 Anthropic tokenizer。
 */
function defaultTokenEstimator(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs + Extensions
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      tokens += 1; // 中文字符约 1 token
    } else {
      tokens += 0.25; // ASCII 约 0.25 token/字符（即 4字符=1token）
    }
  }
  return Math.ceil(tokens);
}

// ─────────────────────────────────────────────────────────────────────────────
// ID 生成器
// ─────────────────────────────────────────────────────────────────────────────

let _msgId = 0;
function nextMsgId(): string {
  return `msg-${Date.now()}-${++_msgId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ContextWindow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LLM Agent 对话上下文窗口管理器。
 *
 * 管理一个 Agent 的完整对话历史，自动处理 token 预算和消息裁剪。
 */
export class ContextWindow {
  private readonly maxTokens: number;
  private readonly maxMessages: number;
  private readonly compressor: Compressor;
  private readonly tokenEstimator: (text: string) => number;

  /** 系统提示消息（固定，不参与裁剪） */
  private systemMessage: Message | null = null;
  /** 非 system 消息列表（按时间升序） */
  private messages: Message[] = [];
  /** 当前累计 token 数（含 system） */
  private _totalTokens = 0;

  constructor(options: ContextWindowOptions = {}) {
    this.maxTokens = options.maxTokens ?? 8000;
    this.maxMessages = options.maxMessages ?? 50;
    this.compressor = options.compressor ?? new TruncateCompressor();
    this.tokenEstimator = options.tokenEstimator ?? defaultTokenEstimator;

    if (options.systemPrompt) {
      const tokens = options.systemTokens ?? this.estimate(options.systemPrompt);
      this.systemMessage = {
        id: "system",
        role: "system",
        content: options.systemPrompt,
        tokens,
        createdAt: Date.now(),
      };
      this._totalTokens += tokens;
    }
  }

  // ── 添加消息 ──────────────────────────────────────────────────────────────

  /** 添加用户消息 */
  addUser(content: string, metadata?: Record<string, unknown>): Message {
    return this._add("user", content, metadata);
  }

  /** 添加 Assistant（AI）消息 */
  addAssistant(content: string, metadata?: Record<string, unknown>): Message {
    return this._add("assistant", content, metadata);
  }

  /** 添加工具调用结果消息 */
  addTool(content: string, metadata?: Record<string, unknown>): Message {
    return this._add("tool", content, metadata);
  }

  /** 通用消息添加（指定 role） */
  addMessage(role: MessageRole, content: string, metadata?: Record<string, unknown>): Message {
    if (role === "system") {
      throw new Error("Use ContextWindow constructor to set system prompt, not addMessage.");
    }
    return this._add(role, content, metadata);
  }

  private _add(role: MessageRole, content: string, metadata?: Record<string, unknown>): Message {
    const tokens = this.estimate(content);
    const msg: Message = {
      id: nextMsgId(),
      role,
      content,
      tokens,
      createdAt: Date.now(),
      ...(metadata !== undefined ? { metadata } : {}),
    };
    this.messages.push(msg);
    this._totalTokens += tokens;
    this._enforceMaxMessages();
    return msg;
  }

  // ── Token 预算控制 ─────────────────────────────────────────────────────────

  /**
   * 检查是否超出 token 预算。
   * 超出时同步执行内置截断压缩（快速兜底）。
   * 若需异步压缩（如调用摘要 LLM），请手动调用 `compress()`。
   */
  get overBudget(): boolean {
    return this._totalTokens > this.maxTokens;
  }

  /**
   * 异步压缩上下文，调用配置的 `Compressor`。
   * 返回被移除的 token 数。
   */
  async compress(): Promise<number> {
    const budget = this.maxTokens - (this.systemMessage?.tokens ?? 0);
    const before = this._totalTokens;
    const compressed = await this.compressor.compress([...this.messages], budget);
    this.messages = compressed;
    this._recalcTokens();
    return before - this._totalTokens;
  }

  // ── 消息窗口上限 ──────────────────────────────────────────────────────────

  private _enforceMaxMessages(): void {
    const limit = this.systemMessage ? this.maxMessages - 1 : this.maxMessages;
    while (this.messages.length > limit) {
      const removed = this.messages.shift();
      if (removed) {
        this._totalTokens -= removed.tokens;
      }
    }
  }

  // ── 导出 ──────────────────────────────────────────────────────────────────

  /**
   * 导出当前上下文为消息列表（兼容 OpenAI Chat Completion 格式）。
   * system 消息始终排在第一位。
   */
  toMessages(): Array<{ role: MessageRole; content: string }> {
    const result: Array<{ role: MessageRole; content: string }> = [];
    if (this.systemMessage) {
      result.push({ role: "system", content: this.systemMessage.content });
    }
    for (const m of this.messages) {
      result.push({ role: m.role, content: m.content });
    }
    return result;
  }

  /**
   * 导出完整 `Message[]`（含 id、tokens、metadata 等）。
   */
  toFullMessages(): Message[] {
    const result: Message[] = [];
    if (this.systemMessage) result.push(this.systemMessage);
    return [...result, ...this.messages];
  }

  // ── 快照/恢复 ─────────────────────────────────────────────────────────────

  /** 创建当前上下文快照（深拷贝） */
  snapshot(): ContextSnapshot {
    return {
      messages: this.messages.map((m) => ({ ...m })),
      totalTokens: this._totalTokens,
      createdAt: Date.now(),
    };
  }

  /** 从快照恢复上下文（替换当前消息列表） */
  restore(snap: ContextSnapshot): void {
    this.messages = snap.messages.map((m) => ({ ...m }));
    this._totalTokens = snap.totalTokens;
  }

  // ── 统计 ──────────────────────────────────────────────────────────────────

  /** 当前上下文统计 */
  stats(): ContextStats {
    return {
      messageCount: this.messages.length + (this.systemMessage ? 1 : 0),
      totalTokens: this._totalTokens,
      maxTokens: this.maxTokens,
      utilization: this._totalTokens / this.maxTokens,
      overBudget: this.overBudget,
    };
  }

  // ── 工具 ──────────────────────────────────────────────────────────────────

  /** 更新系统提示（不清空历史消息） */
  updateSystem(prompt: string): void {
    const tokens = this.estimate(prompt);
    if (this.systemMessage) {
      this._totalTokens -= this.systemMessage.tokens;
    }
    this.systemMessage = {
      id: "system",
      role: "system",
      content: prompt,
      tokens,
      createdAt: Date.now(),
    };
    this._totalTokens += tokens;
  }

  /** 清空所有非 system 消息 */
  clear(): void {
    this._totalTokens -= this.messages.reduce((s, m) => s + m.tokens, 0);
    this.messages = [];
  }

  /** 移除最后一条消息（用于撤销） */
  pop(): Message | undefined {
    const last = this.messages.pop();
    if (last) this._totalTokens -= last.tokens;
    return last;
  }

  /** 估算文本的 token 数 */
  estimate(text: string): number {
    return this.tokenEstimator(text);
  }

  /** 当前消息数量（不含 system） */
  get length(): number {
    return this.messages.length;
  }

  /** 当前总 token 数 */
  get totalTokens(): number {
    return this._totalTokens;
  }

  private _recalcTokens(): void {
    this._totalTokens =
      (this.systemMessage?.tokens ?? 0) + this.messages.reduce((s, m) => s + m.tokens, 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────────────────────────────────────

/** 创建 ContextWindow 实例 */
export function createContext(options?: ContextWindowOptions): ContextWindow {
  return new ContextWindow(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream XI 预设上下文配置
// ─────────────────────────────────────────────────────────────────────────────

/** Dream XI 战术分析师上下文（GPT-4o / Claude 3.5 Sonnet 适配） */
export function createTacticAnalystContext(): ContextWindow {
  return new ContextWindow({
    maxTokens: 24000,
    maxMessages: 30,
    systemPrompt:
      "你是 Dream XI AI 的首席战术分析师。你的职责是基于球员数据、阵型结构和对手特点，提供精准、量化的战术建议。回答时务必简洁、有数据支撑，避免泛泛而谈。",
    compressor: new HeadTailCompressor(2, 8),
  });
}

/** Dream XI 球队管理员上下文（轻量，适合快速问答） */
export function createManagerContext(): ContextWindow {
  return new ContextWindow({
    maxTokens: 8000,
    maxMessages: 20,
    systemPrompt: "你是 Dream XI AI 的球队经理助手，负责协调球员信息、伤病状况和出场阵容决策。",
    compressor: new TruncateCompressor(),
  });
}

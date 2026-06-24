/**
 * @dream-xi/memory — 工作记忆（Working Memory）
 *
 * 当前线程的完整上下文，存储在内存中。
 * 当 Token 数接近窗口上限时，触发自动压缩并生成情景记忆摘要。
 *
 * 参考：docs/ARCHITECTURE.md § ADR-002 持久身份策略
 * 参考：docs/GLOSSARY.md — 工作记忆（Working Memory）
 */

import type {
  ContentBlock,
  IdentityAnchor,
  MemoryConfig,
  Message,
  PlayerId,
  ThreadId,
} from "@dream-xi/types";
import { PLAYER_DEFINITIONS } from "@dream-xi/types";

// ─────────────────────────────────────────────────────────────────────────────
// 工作记忆条目
// ─────────────────────────────────────────────────────────────────────────────

/** 工作记忆中的消息条目 */
export interface WorkingMemoryEntry {
  messageId: string;
  role: "coach" | "player" | "system";
  playerId?: PlayerId;
  content: ContentBlock[];
  tokenCount: number;
  timestamp: Date;
}

/** 上下文压缩触发结果 */
export interface CompressionResult {
  /** 是否触发了压缩 */
  compressed: boolean;
  /** 压缩前的条目数 */
  originalCount: number;
  /** 压缩后的条目数 */
  compressedCount: number;
  /** 生成的情景记忆摘要 */
  summary?: string;
  /** 释放的 Token 数 */
  tokensFreed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 工作记忆管理器
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 工作记忆管理器
 *
 * 管理单个球员在单个线程中的上下文窗口。
 * 自动追踪 Token 消耗，并在接近上限时触发压缩。
 */
export class WorkingMemory {
  private readonly entries: WorkingMemoryEntry[] = [];
  private totalTokens = 0;
  private readonly config: MemoryConfig;
  private readonly playerId: PlayerId;
  private readonly threadId: ThreadId;

  constructor(playerId: PlayerId, threadId: ThreadId, config: MemoryConfig) {
    this.playerId = playerId;
    this.threadId = threadId;
    this.config = config;
  }

  /**
   * 追加一条消息到工作记忆
   */
  append(entry: Omit<WorkingMemoryEntry, "timestamp">): CompressionResult {
    const fullEntry: WorkingMemoryEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.entries.push(fullEntry);
    this.totalTokens += entry.tokenCount;

    // 检查是否需要压缩
    const compressionRatio = this.totalTokens / this.config.workingMemoryMaxTokens;
    if (compressionRatio >= 0.85) {
      return this.compress();
    }

    return {
      compressed: false,
      originalCount: this.entries.length,
      compressedCount: this.entries.length,
      tokensFreed: 0,
    };
  }

  /**
   * 压缩工作记忆
   *
   * 策略：保留最近 30% 的消息，将其余内容生成摘要。
   * 摘要会被写入情景记忆（由调用方处理）。
   */
  compress(): CompressionResult {
    const originalCount = this.entries.length;
    const keepCount = Math.max(3, Math.floor(originalCount * 0.3));
    const toCompress = this.entries.splice(0, originalCount - keepCount);

    // 计算释放的 Token 数
    const tokensFreed = toCompress.reduce((sum, e) => sum + e.tokenCount, 0);
    this.totalTokens -= tokensFreed;

    // 生成简单摘要（生产环境应调用 LLM 生成高质量摘要）
    const summary = this.generateSummary(toCompress);

    return {
      compressed: true,
      originalCount,
      compressedCount: this.entries.length,
      summary,
      tokensFreed,
    };
  }

  /**
   * 构建发送给 LLM 的消息列表（含身份锚定卡）
   *
   * 每隔 N 条消息注入一次身份锚定卡，防止上下文压缩导致球员失忆。
   * 参考：docs/ARCHITECTURE.md § ADR-002
   */
  buildContextMessages(anchorInterval: number = 10): WorkingMemoryEntry[] {
    const anchor = this.buildIdentityAnchor();
    const anchorEntry: WorkingMemoryEntry = {
      messageId: `anchor-${Date.now()}`,
      role: "system",
      content: [
        {
          type: "text",
          text: this.formatIdentityAnchor(anchor),
        },
      ],
      tokenCount: 150, // 锚定卡约 150 tokens
      timestamp: new Date(),
    };

    const result: WorkingMemoryEntry[] = [anchorEntry];

    for (let i = 0; i < this.entries.length; i++) {
      // 每隔 anchorInterval 条消息重新注入一次锚定卡
      if (i > 0 && i % anchorInterval === 0) {
        result.push(anchorEntry);
      }
      result.push(this.entries[i]!);
    }

    return result;
  }

  /**
   * 获取当前 Token 使用情况
   */
  get tokenUsage(): { used: number; limit: number; ratio: number } {
    return {
      used: this.totalTokens,
      limit: this.config.workingMemoryMaxTokens,
      ratio: this.totalTokens / this.config.workingMemoryMaxTokens,
    };
  }

  /**
   * 获取条目数量
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * 清空工作记忆（新线程时调用）
   */
  clear(): void {
    this.entries.length = 0;
    this.totalTokens = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 私有方法
  // ─────────────────────────────────────────────────────────────────────────

  /** 构建身份锚定卡 */
  private buildIdentityAnchor(): IdentityAnchor {
    const def = PLAYER_DEFINITIONS[this.playerId];

    return {
      playerId: this.playerId,
      identity: `${def.nameZh} (${def.nameEn}) #${def.number}`,
      coreRole: def.description,
      personalityKeywords: def.personality,
      fairPlayRules: [
        "不删除持久化数据（数据圣殿）",
        "不杀死父进程（进程自保）",
        "不修改运行时配置（配置只读）",
        "不越过端口边界（端口边界）",
      ],
      activeTactics: [],
      version: 1,
    };
  }

  /** 将身份锚定卡格式化为系统提示文本 */
  private formatIdentityAnchor(anchor: IdentityAnchor): string {
    return [
      `[身份锚定] 你是 ${anchor.identity}`,
      `职责：${anchor.coreRole}`,
      `性格：${anchor.personalityKeywords.join("、")}`,
      `球队铁律：${anchor.fairPlayRules.join("；")}`,
      anchor.activeTactics.length > 0
        ? `当前战术：${anchor.activeTactics.join("、")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** 从压缩的条目列表生成摘要 */
  private generateSummary(entries: WorkingMemoryEntry[]): string {
    const lines = entries.map((e) => {
      const who = e.playerId !== undefined ? `${e.playerId}` : e.role;
      const text = e.content
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .slice(0, 100);
      return `[${who}]: ${text}`;
    });

    return `线程 ${this.threadId} 早期对话摘要（共 ${entries.length} 条）：\n${lines.join("\n")}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 从 Message 对象构建工作记忆条目的工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将 Message 转换为 WorkingMemoryEntry
 *
 * Token 数使用简单估算（生产环境应接入 tokenizer）
 */
export function messageToWorkingEntry(message: Message): WorkingMemoryEntry {
  const estimatedTokens = estimateTokens(message.content);

  return {
    messageId: message.id,
    role: message.source,
    playerId:
      message.senderId !== "coach" && message.senderId !== "system"
        ? (message.senderId as PlayerId)
        : undefined,
    content: message.content,
    tokenCount: estimatedTokens,
    timestamp: message.createdAt,
  };
}

/**
 * 简单 Token 估算（按字符数 / 3 估算，中文 / 1.5）
 *
 * 生产环境应使用 tiktoken 或模型专属 tokenizer。
 */
function estimateTokens(content: ContentBlock[]): number {
  let total = 0;
  for (const block of content) {
    if (block.type === "text") {
      // 中文字符约 1.5 chars/token，英文约 4 chars/token
      const chineseChars = (block.text.match(/[\u4e00-\u9fa5]/gu) ?? []).length;
      const otherChars = block.text.length - chineseChars;
      total += Math.ceil(chineseChars / 1.5) + Math.ceil(otherChars / 4);
    } else if (block.type === "code") {
      total += Math.ceil(block.code.length / 4);
    } else {
      total += 50; // 其他块类型的估算值
    }
  }
  return Math.max(total, 1);
}

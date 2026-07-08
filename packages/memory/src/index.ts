/**
 * @dream-xi/memory — 记忆管理器入口（Memory Manager）
 *
 * 统一管理三层记忆的门面（Facade）：
 *   - 工作记忆（Working Memory）：当前线程上下文
 *   - 情景记忆（Episodic Memory）：跨线程摘要（Redis / 内存）
 *   - 语义记忆（Semantic Memory）：持久经验文档（文件系统）
 *
 * 参考：docs/ARCHITECTURE.md § ADR-002、ADR-006
 * 参考：docs/GLOSSARY.md — 记忆分层说明
 */

import type { MemoryConfig, Message, PlayerId, ThreadId } from "@dream-xi/types";
import {
  type EpisodicBackend,
  EpisodicMemoryStore,
  InMemoryEpisodicBackend,
  type QueryEpisodicOptions,
  type SaveEpisodicOptions,
} from "./episodic-store.js";
import { WorkingMemory, messageToWorkingEntry } from "./working-memory.js";

export { WorkingMemory, messageToWorkingEntry } from "./working-memory.js";
export {
  EpisodicMemoryStore,
  InMemoryEpisodicBackend,
} from "./episodic-store.js";
export type {
  WorkingMemoryEntry,
  CompressionResult,
} from "./working-memory.js";
export type {
  EpisodicBackend,
  SaveEpisodicOptions,
  QueryEpisodicOptions,
} from "./episodic-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// 记忆管理器配置
// ─────────────────────────────────────────────────────────────────────────────

/** 记忆管理器初始化选项 */
export interface MemoryManagerOptions {
  config: MemoryConfig;
  /** 情景记忆后端（不传则使用内存后端，对应 --memory 模式） */
  episodicBackend?: EpisodicBackend;
}

// ─────────────────────────────────────────────────────────────────────────────
// 记忆管理器（三层门面）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dream XI 三层记忆管理器
 *
 * 使用方式：每名球员在每个线程中拥有独立的记忆管理器实例。
 *
 * @example
 * ```ts
 * // 内存模式（开发）
 * const manager = new MemoryManager({
 *   config: {
 *     backend: "memory",
 *     workingMemoryMaxTokens: 100_000,
 *     episodicMemoryTtlSeconds: 30 * 24 * 3600,
 *     semanticMemoryPath: "./data/semantic",
 *     identityAnchorInterval: 10,
 *   },
 * });
 *
 * // 处理一条新消息
 * const result = await manager.processMessage("leo", "thread-abc", incomingMessage);
 * if (result.compressionTriggered) {
 *   console.log("上下文压缩触发，生成情景记忆摘要");
 * }
 *
 * // 查询球员的历史经验（用于提示词注入）
 * const memories = await manager.queryEpisodic({ playerId: "leo", limit: 3 });
 * ```
 */
export class MemoryManager {
  private readonly config: MemoryConfig;
  private readonly episodicStore: EpisodicMemoryStore;

  /**
   * 工作记忆池：每个球员 × 线程的独立工作记忆
   * key 格式：`${playerId}:${threadId}`
   */
  private readonly workingPool = new Map<string, WorkingMemory>();

  constructor(options: MemoryManagerOptions) {
    this.config = options.config;
    this.episodicStore = new EpisodicMemoryStore(
      options.config,
      options.episodicBackend ?? new InMemoryEpisodicBackend(),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 工作记忆操作
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 处理一条新消息：追加到工作记忆，触发压缩时自动归档到情景记忆
   */
  async processMessage(
    playerId: PlayerId,
    threadId: ThreadId,
    message: Message,
  ): Promise<{
    compressionTriggered: boolean;
    tokensUsed: number;
    episodicMemoryId?: string;
  }> {
    const working = this.getOrCreateWorking(playerId, threadId);
    const entry = messageToWorkingEntry(message);
    const compressionResult = working.append(entry);

    let episodicMemoryId: string | undefined;

    // 若触发压缩，将摘要保存到情景记忆
    if (compressionResult.compressed && compressionResult.summary !== undefined) {
      const saved = await this.episodicStore.save({
        playerId,
        sourceThreadId: threadId,
        threadSummary: compressionResult.summary,
        keyDecisions: [],
        lessonsLearned: [],
        importance: 0.5,
        tags: ["auto-compression"],
      });
      episodicMemoryId = saved.id;
    }

    return {
      compressionTriggered: compressionResult.compressed,
      tokensUsed: working.tokenUsage.used,
      ...(episodicMemoryId !== undefined ? { episodicMemoryId } : {}),
    };
  }

  /**
   * 获取球员在线程中的上下文消息列表（用于构建 LLM 请求）
   */
  getContextMessages(playerId: PlayerId, threadId: ThreadId) {
    const working = this.getOrCreateWorking(playerId, threadId);
    return working.buildContextMessages(this.config.identityAnchorInterval);
  }

  /**
   * 获取球员在线程中的 Token 使用情况
   */
  getTokenUsage(playerId: PlayerId, threadId: ThreadId) {
    const working = this.getOrCreateWorking(playerId, threadId);
    return working.tokenUsage;
  }

  /**
   * 清空某球员在某线程的工作记忆（开启新线程时调用）
   */
  clearWorking(playerId: PlayerId, threadId: ThreadId): void {
    const key = buildPoolKey(playerId, threadId);
    this.workingPool.delete(key);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 情景记忆操作
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 手动保存情景记忆（赛后复盘时调用）
   */
  async saveEpisodic(options: SaveEpisodicOptions) {
    return this.episodicStore.save(options);
  }

  /**
   * 查询球员的情景记忆（用于提示词注入，提供历史上下文）
   */
  async queryEpisodic(options: QueryEpisodicOptions) {
    return this.episodicStore.query(options);
  }

  /**
   * 为球员构建富含历史经验的系统提示前缀
   *
   * 将最相关的情景记忆注入到提示词中，让球员"记得"之前的比赛经验。
   */
  async buildMemoryContext(playerId: PlayerId, limit = 3): Promise<string> {
    const memories = await this.episodicStore.query({ playerId, limit, minImportance: 0.3 });

    if (memories.length === 0) return "";

    const lines = memories.map((m, i) => {
      const decisions = m.keyDecisions.map((d) => `  - ${d}`).join("\n");
      const lessons = m.lessonsLearned.map((l) => `  - ${l}`).join("\n");
      return [
        `【比赛回忆 ${i + 1}】${m.threadSummary}`,
        decisions ? `关键决策：\n${decisions}` : "",
        lessons ? `经验沉淀：\n${lessons}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    return `[历史经验]\n${lines.join("\n\n")}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 统计信息
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 获取记忆系统运行状态摘要
   */
  getStats(): {
    backend: string;
    activeWorkingMemories: number;
    workingMemoryDetails: Array<{ key: string; tokens: number; entries: number }>;
  } {
    const details = Array.from(this.workingPool.entries()).map(([key, wm]) => ({
      key,
      tokens: wm.tokenUsage.used,
      entries: wm.length,
    }));

    return {
      backend: this.config.backend,
      activeWorkingMemories: this.workingPool.size,
      workingMemoryDetails: details,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 私有工具
  // ─────────────────────────────────────────────────────────────────────────

  private getOrCreateWorking(playerId: PlayerId, threadId: ThreadId): WorkingMemory {
    const key = buildPoolKey(playerId, threadId);
    let wm = this.workingPool.get(key);
    if (wm === undefined) {
      wm = new WorkingMemory(playerId, threadId, this.config);
      this.workingPool.set(key, wm);
    }
    return wm;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工厂函数：快速创建记忆管理器
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建内存模式记忆管理器（`pnpm start --memory`）
 *
 * @example
 * ```ts
 * const memory = createInMemoryManager();
 * ```
 */
export function createInMemoryManager(): MemoryManager {
  return new MemoryManager({
    config: {
      backend: "memory",
      workingMemoryMaxTokens: 100_000,
      episodicMemoryTtlSeconds: 30 * 24 * 3600, // 30 天
      semanticMemoryPath: "./data/semantic",
      identityAnchorInterval: 10,
    },
  });
}

/**
 * 创建 Redis 模式记忆管理器（生产环境）
 *
 * @example
 * ```ts
 * const memory = createRedisManager("redis://localhost:6379");
 * ```
 */
export function createRedisManager(
  redisUrl: string,
  episodicBackend?: EpisodicBackend,
): MemoryManager {
  return new MemoryManager({
    config: {
      backend: "redis",
      redisUrl,
      workingMemoryMaxTokens: 150_000,
      episodicMemoryTtlSeconds: 90 * 24 * 3600, // 90 天
      semanticMemoryPath: "./data/semantic",
      identityAnchorInterval: 10,
    },
    ...(episodicBackend !== undefined ? { episodicBackend } : {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function buildPoolKey(playerId: PlayerId, threadId: ThreadId): string {
  return `${playerId}:${threadId}`;
}

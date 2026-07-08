/**
 * @dream-xi/router — 线程管理器（Thread Manager）
 *
 * 管理战术板（Thread）的生命周期：创建、切换、归档。
 * 每个线程是独立的上下文空间，消息不会跨线程泄露。
 *
 * 参考：docs/SOP.md § 传球规则（A2A 通信）
 * 参考：docs/GLOSSARY.md — 战术板 (Tactical Board) = Thread
 */

import type { PlayerId, Thread, ThreadId, ThreadStatus } from "@dream-xi/types";

/** 线程创建选项 */
export interface CreateThreadOptions {
  /** 线程标题（可选，留空则自动生成） */
  title?: string;
  /** 创建者 ID */
  createdBy: string;
  /** 初始参与球员 */
  initialParticipants?: PlayerId[];
  /** 线程标签 */
  tags?: string[];
}

/** 线程更新选项 */
export interface UpdateThreadOptions {
  title?: string;
  status?: ThreadStatus;
  tags?: string[];
}

/**
 * 线程管理器
 *
 * 内存实现，生产环境应替换为 Redis 持久化后端。
 *
 * @example
 * ```ts
 * const manager = new ThreadManager();
 * const thread = manager.create({ createdBy: "coach", title: "用户认证重构" });
 * manager.setActive(thread.id);
 * ```
 */
export class ThreadManager {
  private readonly threads = new Map<ThreadId, Thread>();
  private activeThreadId: ThreadId | null = null;

  /**
   * 创建新线程（/new 指令）
   */
  create(options: CreateThreadOptions): Thread {
    const id = generateThreadId();
    const now = new Date();

    const thread: Thread = {
      id,
      title: options.title ?? `比赛 ${formatDate(now)}`,
      status: "active",
      createdBy: options.createdBy,
      participants: options.initialParticipants ?? [],
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      tags: options.tags ?? [],
    };

    this.threads.set(id, thread);
    return thread;
  }

  /**
   * 获取线程（若不存在返回 undefined）
   */
  get(threadId: ThreadId): Thread | undefined {
    return this.threads.get(threadId);
  }

  /**
   * 获取所有线程（/threads 指令），按更新时间倒序
   */
  list(filter?: { status?: ThreadStatus }): Thread[] {
    const all = Array.from(this.threads.values());
    const filtered =
      filter?.status !== undefined ? all.filter((t) => t.status === filter.status) : all;
    return filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * 设置当前活跃线程（/use <id> 指令）
   */
  setActive(threadId: ThreadId): void {
    if (!this.threads.has(threadId)) {
      throw new Error(`线程不存在：${threadId}`);
    }
    this.activeThreadId = threadId;
  }

  /**
   * 获取当前活跃线程（/where 指令）
   */
  getActive(): Thread | null {
    if (this.activeThreadId === null) return null;
    return this.threads.get(this.activeThreadId) ?? null;
  }

  /**
   * 更新线程属性
   */
  update(threadId: ThreadId, options: UpdateThreadOptions): Thread {
    const thread = this.threads.get(threadId);
    if (thread === undefined) {
      throw new Error(`线程不存在：${threadId}`);
    }

    const updated: Thread = {
      ...thread,
      ...(options.title !== undefined && { title: options.title }),
      ...(options.status !== undefined && { status: options.status }),
      ...(options.tags !== undefined && { tags: options.tags }),
      updatedAt: new Date(),
    };

    this.threads.set(threadId, updated);
    return updated;
  }

  /**
   * 归档线程（完成的比赛）
   */
  archive(threadId: ThreadId): Thread {
    return this.update(threadId, { status: "archived" });
  }

  /**
   * 添加参与球员
   */
  addParticipant(threadId: ThreadId, playerId: PlayerId): Thread {
    const thread = this.threads.get(threadId);
    if (thread === undefined) {
      throw new Error(`线程不存在：${threadId}`);
    }

    if (!thread.participants.includes(playerId)) {
      return this.update(threadId, {
        ...thread,
        // participants 需要手动更新，因为 UpdateThreadOptions 没有此字段
      });
    }

    const updated: Thread = {
      ...thread,
      participants: [...thread.participants, playerId],
      updatedAt: new Date(),
    };
    this.threads.set(threadId, updated);
    return updated;
  }

  /**
   * 增加消息计数
   */
  incrementMessageCount(threadId: ThreadId): void {
    const thread = this.threads.get(threadId);
    if (thread === undefined) return;

    this.threads.set(threadId, {
      ...thread,
      messageCount: thread.messageCount + 1,
      updatedAt: new Date(),
    });
  }

  /**
   * 获取线程总数
   */
  get size(): number {
    return this.threads.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

/** 生成线程 ID（简单实现，生产环境使用 UUID） */
function generateThreadId(): ThreadId {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 格式化日期为可读字符串 */
function formatDate(date: Date): string {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

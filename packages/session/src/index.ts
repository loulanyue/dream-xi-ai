/**
 * @dream-xi/session — 对话会话管理器
 *
 * 为 Dream XI AI 球员提供轻量级对话会话（Session）管理：
 * - 会话创建 / 读取 / 更新 / 删除（CRUD）
 * - TTL 自动过期（惰性清理 + 定时扫描两种策略）
 * - 会话消息追加与历史记录
 * - 会话快照（深拷贝导出）
 * - 内存存储后端（可替换为 Redis 等外部存储）
 *
 * @example
 * ```ts
 * const store = new SessionStore({ ttlMs: 30 * 60 * 1000 }); // 30 分钟 TTL
 *
 * // 创建会话
 * const session = store.create({ playerId: "CR7", userId: "u001" });
 *
 * // 追加消息
 * store.appendMessage(session.id, { role: "user", content: "你好！" });
 * store.appendMessage(session.id, { role: "assistant", content: "你好，我是 CR7！" });
 *
 * // 读取会话
 * const s = store.get(session.id);
 * console.log(s?.messages.length); // 2
 *
 * // 快照导出
 * const snap = store.snapshot(session.id);
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** 会话中的单条消息 */
export interface SessionMessage {
  /** 消息角色 */
  role: "system" | "user" | "assistant" | "tool";
  /** 消息文本内容 */
  content: string;
  /** 消息名称（tool role 时为工具名，可选） */
  name?: string;
  /** 消息到达时间戳（毫秒） */
  timestamp: number;
}

/** 会话元数据 */
export interface SessionMeta {
  /** 关联球员 ID */
  playerId?: string;
  /** 关联用户 ID */
  userId?: string;
  /** 会话标题（可选，用于 UI 展示） */
  title?: string;
  /** 自定义标签 */
  tags?: string[];
  /** 扩展属性（任意键值） */
  extra?: Record<string, unknown>;
}

/** 完整会话对象 */
export interface Session {
  /** 会话唯一 ID */
  id: string;
  /** 会话消息列表（按时间顺序） */
  messages: SessionMessage[];
  /** 会话元数据 */
  meta: SessionMeta;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 最后活跃时间戳（毫秒），每次读写时更新 */
  lastActiveAt: number;
  /** 过期时间戳（毫秒），超过此时间视为过期 */
  expiresAt: number;
}

/** SessionStore 配置 */
export interface SessionStoreOptions {
  /**
   * 会话生存时间（毫秒），默认 30 分钟
   * 每次访问（get / appendMessage）会重置 expiresAt
   */
  ttlMs?: number;
  /**
   * 定时扫描过期会话的间隔（毫秒），默认 5 分钟
   * 设为 0 则禁用定时扫描（仅使用惰性清理）
   */
  sweepIntervalMs?: number;
  /**
   * 会话 ID 生成函数，默认使用 crypto.randomUUID()
   */
  generateId?: () => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionStore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 内存会话存储
 *
 * 支持 TTL 自动过期，惰性清理（读取时检查）+ 可选定时扫描。
 */
export class SessionStore {
  private readonly store = new Map<string, Session>();
  private readonly ttlMs: number;
  private readonly genId: () => string;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000;
    this.genId = options.generateId ?? (() => crypto.randomUUID());

    const sweepMs = options.sweepIntervalMs ?? 5 * 60 * 1000;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
    }
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * 创建新会话
   *
   * @param meta 会话元数据（playerId / userId / title 等）
   * @param initialMessages 可选的初始消息列表（如 system prompt）
   */
  create(
    meta: SessionMeta = {},
    initialMessages: Omit<SessionMessage, "timestamp">[] = [],
  ): Session {
    const now = Date.now();
    const session: Session = {
      id: this.genId(),
      messages: initialMessages.map((m) => ({ ...m, timestamp: now })),
      meta: { ...meta },
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.store.set(session.id, session);
    return this.cloneSession(session);
  }

  /**
   * 获取会话（惰性检查 TTL，过期返回 undefined）
   *
   * @param id 会话 ID
   */
  get(id: string): Session | undefined {
    const session = this.store.get(id);
    if (!session) return undefined;

    // 惰性清理
    if (Date.now() > session.expiresAt) {
      this.store.delete(id);
      return undefined;
    }

    // 更新最后活跃时间
    const now = Date.now();
    session.lastActiveAt = now;
    session.expiresAt = now + this.ttlMs;

    return this.cloneSession(session);
  }

  /**
   * 更新会话元数据（部分更新，支持 merge）
   *
   * @param id 会话 ID
   * @param patch 要合并的元数据字段
   */
  updateMeta(id: string, patch: Partial<SessionMeta>): boolean {
    const session = this.store.get(id);
    if (!session || Date.now() > session.expiresAt) return false;

    session.meta = { ...session.meta, ...patch };
    session.lastActiveAt = Date.now();
    session.expiresAt = session.lastActiveAt + this.ttlMs;
    return true;
  }

  /**
   * 向会话追加一条消息
   *
   * @param id 会话 ID
   * @param message 消息内容（不含 timestamp，自动填充）
   */
  appendMessage(id: string, message: Omit<SessionMessage, "timestamp">): boolean {
    const session = this.store.get(id);
    if (!session || Date.now() > session.expiresAt) return false;

    const now = Date.now();
    session.messages.push({ ...message, timestamp: now });
    session.lastActiveAt = now;
    session.expiresAt = now + this.ttlMs;
    return true;
  }

  /**
   * 删除会话
   *
   * @param id 会话 ID
   */
  delete(id: string): boolean {
    return this.store.delete(id);
  }

  /**
   * 检查会话是否存在且未过期
   */
  has(id: string): boolean {
    const session = this.store.get(id);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.store.delete(id);
      return false;
    }
    return true;
  }

  // ─── 快照 ──────────────────────────────────────────────────────────────────

  /**
   * 导出会话深拷贝快照
   *
   * @param id 会话 ID
   */
  snapshot(id: string): Session | undefined {
    return this.get(id);
  }

  /**
   * 导出所有未过期会话的快照列表
   */
  listAll(): Session[] {
    const now = Date.now();
    const result: Session[] = [];
    for (const [id, session] of this.store) {
      if (now > session.expiresAt) {
        this.store.delete(id);
        continue;
      }
      result.push(this.cloneSession(session));
    }
    return result;
  }

  // ─── 统计 ──────────────────────────────────────────────────────────────────

  /** 当前存活会话数（含可能已过期但未惰性清理的） */
  get size(): number {
    return this.store.size;
  }

  /** 手动触发过期扫描，返回清理的会话数量 */
  sweep(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, session] of this.store) {
      if (now > session.expiresAt) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * 停止定时扫描（释放资源，适合测试或优雅关闭场景）
   */
  destroy(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
  }

  // ─── 内部工具 ──────────────────────────────────────────────────────────────

  /** 深拷贝会话（避免外部修改影响内部状态） */
  private cloneSession(session: Session): Session {
    const src = session.meta;
    const metaBase: SessionMeta = {};
    if (src.playerId !== undefined) metaBase.playerId = src.playerId;
    if (src.userId !== undefined) metaBase.userId = src.userId;
    if (src.title !== undefined) metaBase.title = src.title;
    if (src.tags !== undefined) metaBase.tags = [...src.tags];
    if (src.extra !== undefined) metaBase.extra = { ...src.extra };
    return {
      id: session.id,
      messages: session.messages.map((m) => ({ ...m })),
      meta: metaBase,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
    };
  }
}

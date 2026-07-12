/**
 * @dream-xi/stream — LLM 流式响应处理器
 *
 * 为 Dream XI AI 球员提供完整的 LLM 流式输出处理能力：
 * - SSE（Server-Sent Events）原始数据解析
 * - 流式 chunk 实时累积与回调通知
 * - 中止信号（AbortController）集成
 * - 简易 token 计数估算（按空格/字符分词）
 * - 流读取完整结果汇总
 *
 * @example SSE 流解析
 * ```ts
 * const reader = new SseStreamReader({
 *   onChunk: (chunk) => process.stdout.write(chunk.delta),
 *   onDone:  (result) => console.log("总 token 数：", result.estimatedTokens),
 * });
 *
 * // 传入标准 ReadableStream<Uint8Array>（fetch response.body）
 * await reader.consume(response.body!);
 * ```
 *
 * @example 手动解析 SSE 行
 * ```ts
 * const chunks = parseSseLines("data: hello\n\ndata: world\n\n");
 * // => [{ data: "hello" }, { data: "world" }]
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// SSE 解析
// ─────────────────────────────────────────────────────────────────────────────

/** 单条 SSE 事件 */
export interface SseEvent {
  /** 事件类型（对应 `event:` 字段，默认 "message"） */
  event: string;
  /** 事件数据（对应 `data:` 字段） */
  data: string;
  /** 事件 ID（对应 `id:` 字段，可选） */
  id?: string;
  /** 重试间隔（对应 `retry:` 字段，可选，毫秒） */
  retry?: number;
}

/**
 * 将原始 SSE 文本解析为事件列表
 *
 * 支持标准 SSE 格式（RFC 8895）：
 * - `data: <value>`
 * - `event: <type>`
 * - `id: <id>`
 * - `retry: <ms>`
 * - 空行分隔事件
 * - `: <comment>` 注释行（忽略）
 *
 * @param raw 原始 SSE 文本（可以是多个事件的拼接）
 */
export function parseSseLines(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  // 按空行切分事件块
  const blocks = raw.split(/\n\n|\r\n\r\n/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    let event = "message";
    let data = "";
    let id: string | undefined;
    let retry: number | undefined;

    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith(":")) continue; // 注释行

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const field = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trimStart();

      switch (field) {
        case "data":
          data = data ? `${data}\n${value}` : value;
          break;
        case "event":
          event = value;
          break;
        case "id":
          id = value;
          break;
        case "retry": {
          const ms = Number.parseInt(value, 10);
          if (!Number.isNaN(ms)) retry = ms;
          break;
        }
      }
    }

    // 仅当 data 非空时作为有效事件
    if (data) {
      const entry: SseEvent = { event, data };
      if (id !== undefined) entry.id = id;
      if (retry !== undefined) entry.retry = retry;
      events.push(entry);
    }
  }

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// 流式 chunk 类型
// ─────────────────────────────────────────────────────────────────────────────

/** 单个流式 chunk */
export interface StreamChunk {
  /** chunk 序号（从 0 开始） */
  index: number;
  /** 本 chunk 新增的文本片段 */
  delta: string;
  /** 截至本 chunk 累积的完整文本 */
  accumulated: string;
  /** 本 chunk 到达时的时间戳（毫秒） */
  receivedAt: number;
}

/** 流读取完成后的汇总结果 */
export interface StreamResult {
  /** 完整输出文本 */
  fullText: string;
  /** 总 chunk 数量 */
  totalChunks: number;
  /** 估算 token 数（按空格分词） */
  estimatedTokens: number;
  /** 首 token 到达耗时（毫秒） */
  firstTokenMs: number;
  /** 总耗时（毫秒） */
  totalMs: number;
  /** 是否因中止信号提前终止 */
  aborted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SseStreamReader
// ─────────────────────────────────────────────────────────────────────────────

export interface SseStreamReaderOptions {
  /**
   * 每收到一个 SSE 事件时的回调
   * （在 chunk 累积之前触发，适合直接转发原始事件）
   */
  onEvent?: (event: SseEvent) => void;
  /**
   * 每收到有效文本 chunk 时的回调
   * （delta 已解析，accumulated 实时更新）
   */
  onChunk?: (chunk: StreamChunk) => void;
  /**
   * 流读取完成时的回调（无论正常结束还是中止）
   */
  onDone?: (result: StreamResult) => void;
  /**
   * 从 SSE data 字段中提取文本 delta 的函数
   *
   * 默认策略：
   * 1. 若 data === "[DONE]" → 返回 null（流结束信号）
   * 2. 若 data 是合法 JSON 且含 `choices[0].delta.content` → 返回该字段
   * 3. 否则直接返回 data 字符串
   */
  extractDelta?: (data: string) => string | null;
  /**
   * AbortSignal，用于提前中止流读取
   */
  signal?: AbortSignal;
}

/**
 * SSE 流读取器
 *
 * 接收 `ReadableStream<Uint8Array>`（来自 fetch 的 `response.body`），
 * 逐行解析 SSE 事件，累积文本 delta 并触发回调。
 */
export class SseStreamReader {
  private readonly options: SseStreamReaderOptions;
  private readonly decoder = new TextDecoder("utf-8");

  constructor(options: SseStreamReaderOptions = {}) {
    this.options = options;
  }

  /**
   * 消费 ReadableStream，读取至流结束或 AbortSignal 触发
   *
   * @param body 标准 Web ReadableStream（fetch response.body）
   */
  async consume(body: ReadableStream<Uint8Array>): Promise<StreamResult> {
    const { onEvent, onChunk, onDone, signal } = this.options;
    const extractDelta = this.options.extractDelta ?? defaultExtractDelta;

    const startedAt = Date.now();
    let firstTokenMs = -1;
    let accumulated = "";
    let chunkIndex = 0;
    let aborted = false;
    let buffer = "";

    const reader = body.getReader();

    try {
      while (true) {
        // 中止信号检查
        if (signal?.aborted) {
          aborted = true;
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += this.decoder.decode(value, { stream: true });

        // 按完整 SSE 事件块切分（\n\n 或 \r\n\r\n）
        const boundary = /\n\n|\r\n\r\n/;
        let match: RegExpExecArray | null;

        // biome-ignore lint/suspicious/noAssignInExpressions: idiom for consuming buffer
        while ((match = boundary.exec(buffer)) !== null) {
          const block = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);

          const events = parseSseLines(`${block}\n\n`);
          for (const event of events) {
            onEvent?.(event);

            const delta = extractDelta(event.data);
            if (delta === null) {
              // [DONE] 信号 → 结束读取
              aborted = false;
              break;
            }
            if (!delta) continue;

            if (firstTokenMs === -1) firstTokenMs = Date.now() - startedAt;
            accumulated += delta;

            const chunk: StreamChunk = {
              index: chunkIndex++,
              delta,
              accumulated,
              receivedAt: Date.now(),
            };
            onChunk?.(chunk);
          }
        }

        if (signal?.aborted) {
          aborted = true;
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const result: StreamResult = {
      fullText: accumulated,
      totalChunks: chunkIndex,
      estimatedTokens: estimateTokens(accumulated),
      firstTokenMs: firstTokenMs === -1 ? 0 : firstTokenMs,
      totalMs: Date.now() - startedAt,
      aborted,
    };

    onDone?.(result);
    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 默认 delta 提取策略（兼容 OpenAI / Anthropic streaming 格式）
 *
 * - `[DONE]` → null（流结束）
 * - JSON 含 `choices[0].delta.content` → OpenAI chat 格式
 * - JSON 含 `delta.text` → Anthropic 格式
 * - 否则直接返回原始 data 字符串
 */
export function defaultExtractDelta(data: string): string | null {
  if (data.trim() === "[DONE]") return null;

  // Internal typed shapes for OpenAI / Anthropic response chunks
  interface OpenAiDelta {
    content?: string;
  }
  interface OpenAiChoice {
    delta?: OpenAiDelta;
  }
  interface OpenAiChunk {
    choices?: OpenAiChoice[];
  }
  interface AnthropicDelta {
    text?: string;
  }
  interface AnthropicChunk {
    delta?: AnthropicDelta;
  }

  try {
    const parsed = JSON.parse(data) as OpenAiChunk & AnthropicChunk;

    // OpenAI format: choices[0].delta.content
    if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      const content = parsed.choices[0]?.delta?.content;
      if (typeof content === "string") return content;
    }

    // Anthropic format: delta.text
    const text = parsed.delta?.text;
    if (typeof text === "string") return text;
  } catch {
    // 非 JSON，直接返回原文
  }

  return data;
}

/**
 * 简易 token 数量估算（按空格分词，适合英文；中文按字符 ÷ 1.5 估算）
 *
 * @param text 待估算文本
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 英文按空格分词，中文字符单独计数后 ×0.67
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length;
  const latinWords = text
    .replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return latinWords + Math.ceil(cjkCount * 0.67);
}

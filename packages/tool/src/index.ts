/**
 * @dream-xi/tool — Agent 工具注册与调用框架
 *
 * 为 Dream XI AI 球员提供标准化的函数调用（Function Calling）工具体系：
 * - 工具定义（JSON Schema 参数描述）
 * - 工具注册中心（ToolRegistry）
 * - 类型安全的工具调用与结果封装
 * - 工具调用历史记录
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 *
 * registry.register({
 *   name: "get_weather",
 *   description: "获取指定城市的实时天气",
 *   parameters: {
 *     type: "object",
 *     properties: {
 *       city: { type: "string", description: "城市名称" },
 *     },
 *     required: ["city"],
 *   },
 *   handler: async ({ city }) => `${city}：晴，28°C`,
 * });
 *
 * const result = await registry.call("get_weather", { city: "上海" });
 * console.log(result.output); // "上海：晴，28°C"
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// JSON Schema 参数类型
// ─────────────────────────────────────────────────────────────────────────────

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export interface JsonSchemaProperty {
  type: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具定义
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
  /** 工具唯一名称（LLM 使用此名称调用） */
  name: string;
  /** 工具功能描述（LLM 使用此描述选择工具） */
  description: string;
  /** 参数 JSON Schema 定义 */
  parameters: ToolParameterSchema;
  /** 工具执行处理函数 */
  handler: (input: TInput) => TOutput | Promise<TOutput>;
  /** 可选：工具标签（用于分类筛选） */
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具调用结果
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolCallResult<TOutput = unknown> {
  /** 工具名称 */
  toolName: string;
  /** 输入参数（原始传入） */
  input: Record<string, unknown>;
  /** 调用输出 */
  output: TOutput;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 是否执行成功 */
  success: boolean;
  /** 若失败，错误信息 */
  error?: string;
  /** 调用时间戳（ISO 格式） */
  calledAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具注册中心
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 工具注册中心
 *
 * 负责管理工具的注册、查找和调用。
 * 支持按名称查找工具、列出所有工具的 Schema（供 LLM 使用）
 * 以及带类型安全的工具调用。
 */
export class ToolRegistry {
  // biome-ignore lint/suspicious/noExplicitAny: tool handler types are intentionally flexible
  private readonly tools = new Map<string, ToolDefinition<any, any>>();
  private readonly history: ToolCallResult[] = [];

  /**
   * 注册一个工具
   *
   * @param tool 工具定义
   */
  register<TInput extends Record<string, unknown>, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
  ): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具 "${tool.name}" 已存在，请先注销后再注册`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  /**
   * 注销一个工具
   *
   * @param name 工具名称
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 检查工具是否已注册
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 调用指定工具
   *
   * @param name 工具名称
   * @param input 调用参数（须符合工具的 parameter schema）
   */
  async call<TOutput = unknown>(
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolCallResult<TOutput>> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`工具 "${name}" 未注册`);
    }

    const startedAt = Date.now();
    const calledAt = new Date().toISOString();

    try {
      const output = (await tool.handler(input)) as TOutput;
      const result: ToolCallResult<TOutput> = {
        toolName: name,
        input,
        output,
        durationMs: Date.now() - startedAt,
        success: true,
        calledAt,
      };
      this.history.push(result as ToolCallResult);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const result: ToolCallResult<TOutput> = {
        toolName: name,
        input,
        output: undefined as unknown as TOutput,
        durationMs: Date.now() - startedAt,
        success: false,
        error: errorMsg,
        calledAt,
      };
      this.history.push(result as ToolCallResult);
      throw err;
    }
  }

  /**
   * 导出所有工具的 Schema（用于 LLM function calling 参数描述）
   */
  toSchemas(): Array<{ name: string; description: string; parameters: ToolParameterSchema }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  /**
   * 按标签筛选工具 Schema
   *
   * @param tag 标签名称
   */
  schemasByTag(
    tag: string,
  ): Array<{ name: string; description: string; parameters: ToolParameterSchema }> {
    return Array.from(this.tools.values())
      .filter((t) => t.tags?.includes(tag))
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
  }

  /**
   * 获取工具调用历史（最近 n 条）
   *
   * @param limit 最多返回条数（默认 50）
   */
  getHistory(limit = 50): ToolCallResult[] {
    return this.history.slice(-limit);
  }

  /** 清空调用历史 */
  clearHistory(): void {
    this.history.length = 0;
  }

  /** 当前已注册工具总数 */
  get size(): number {
    return this.tools.size;
  }
}

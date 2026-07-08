/**
 * @dream-xi/validator — 轻量级请求验证器
 *
 * 为 Dream XI AI 所有 HTTP API 端点提供统一的请求体校验。
 * 零外部依赖，基于 Schema 描述符驱动，支持类型推断。
 *
 * 设计原则：
 *   - 零依赖：不引入 zod / yup / joi 等第三方库
 *   - Schema 驱动：通过描述符对象声明字段规则
 *   - 类型推断：从 Schema 自动推断 TypeScript 类型
 *   - 详细错误：每个字段单独返回错误路径 + 错误消息
 *   - 链式规则：支持多个校验器顺序执行（fail-fast）
 *   - 嵌套对象：支持对象和数组的递归校验
 *
 * @example
 * ```ts
 * import { v, validate } from "@dream-xi/validator";
 *
 * const ChatSchema = v.object({
 *   message:  v.string().minLength(1).maxLength(4000),
 *   threadId: v.string().optional(),
 *   playerId: v.string().oneOf(["leo", "andre", "flash", "wall"]).optional(),
 *   options:  v.object({
 *     stream:      v.boolean().optional(),
 *     temperature: v.number().min(0).max(2).optional(),
 *   }).optional(),
 * });
 *
 * const result = validate(ChatSchema, requestBody);
 * if (!result.ok) {
 *   console.log(result.errors); // [{ path: "message", message: "必填字段" }]
 * } else {
 *   console.log(result.data); // 类型安全的校验后数据
 * }
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────────────────────
// 验证错误类型
// ─────────────────────────────────────────────────────────────────────────────

/** 单个字段验证错误 */
export interface ValidationError {
  /** 字段路径（用 `.` 分隔，如 `"options.temperature"`） */
  path: string;
  /** 错误消息（中文） */
  message: string;
  /** 实际传入值（便于调试） */
  received?: unknown;
}

/** 验证结果（成功） */
export interface ValidationSuccess<T> {
  ok: true;
  data: T;
  errors?: never;
}

/** 验证结果（失败） */
export interface ValidationFailure {
  ok: false;
  data?: never;
  errors: ValidationError[];
}

/** 验证结果联合类型 */
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// ─────────────────────────────────────────────────────────────────────────────
// Schema 描述符基类
// ─────────────────────────────────────────────────────────────────────────────

/** Schema 描述符基类 */
abstract class Schema<_T> {
  protected _optional = false;
  protected _label?: string;

  /** 标记为可选字段（允许 undefined / null） */
  optional(): this {
    this._optional = true;
    return this;
  }

  /** 设置字段显示名称（用于错误消息） */
  label(name: string): this {
    this._label = name;
    return this;
  }

  /** 执行校验，返回错误列表 */
  abstract _validate(value: unknown, path: string): ValidationError[];

  /** 是否可选 */
  get isOptional(): boolean {
    return this._optional;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 字符串 Schema
// ─────────────────────────────────────────────────────────────────────────────

export class StringSchema extends Schema<string> {
  private _minLength?: number;
  private _maxLength?: number;
  private _pattern?: RegExp;
  private _patternMsg?: string | undefined;
  private _oneOf?: readonly string[];
  private _trim = false;

  /** 最小长度 */
  minLength(n: number): this {
    this._minLength = n;
    return this;
  }

  /** 最大长度 */
  maxLength(n: number): this {
    this._maxLength = n;
    return this;
  }

  /** 正则匹配 */
  pattern(re: RegExp, message?: string): this {
    this._pattern = re;
    this._patternMsg = message;
    return this;
  }

  /** 枚举值限制 */
  oneOf(values: readonly string[]): this {
    this._oneOf = values;
    return this;
  }

  /** 自动 trim 空白 */
  trim(): this {
    this._trim = true;
    return this;
  }

  _validate(value: unknown, path: string): ValidationError[] {
    const label = this._label ?? (path || "该字段");

    if (value === undefined || value === null || value === "") {
      if (this._optional) return [];
      return [{ path, message: `${label} 为必填项`, received: value }];
    }

    if (typeof value !== "string") {
      return [{ path, message: `${label} 必须是字符串`, received: typeof value }];
    }

    const str = this._trim ? value.trim() : value;
    const errors: ValidationError[] = [];

    if (this._minLength !== undefined && str.length < this._minLength) {
      errors.push({
        path,
        message: `${label} 长度不能少于 ${this._minLength} 个字符（当前 ${str.length}）`,
        received: str.length,
      });
    }

    if (this._maxLength !== undefined && str.length > this._maxLength) {
      errors.push({
        path,
        message: `${label} 长度不能超过 ${this._maxLength} 个字符（当前 ${str.length}）`,
        received: str.length,
      });
    }

    if (this._pattern !== undefined && !this._pattern.test(str)) {
      errors.push({
        path,
        message: this._patternMsg ?? `${label} 格式不正确`,
        received: str,
      });
    }

    if (this._oneOf !== undefined && !this._oneOf.includes(str)) {
      errors.push({
        path,
        message: `${label} 必须是以下值之一：${this._oneOf.map((v) => `"${v}"`).join("、")}`,
        received: str,
      });
    }

    return errors;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 数字 Schema
// ─────────────────────────────────────────────────────────────────────────────

export class NumberSchema extends Schema<number> {
  private _min?: number;
  private _max?: number;
  private _integer = false;

  /** 最小值（含） */
  min(n: number): this {
    this._min = n;
    return this;
  }

  /** 最大值（含） */
  max(n: number): this {
    this._max = n;
    return this;
  }

  /** 限制为整数 */
  integer(): this {
    this._integer = true;
    return this;
  }

  _validate(value: unknown, path: string): ValidationError[] {
    const label = this._label ?? (path || "该字段");

    if (value === undefined || value === null) {
      if (this._optional) return [];
      return [{ path, message: `${label} 为必填项`, received: value }];
    }

    if (typeof value !== "number" || Number.isNaN(value)) {
      return [{ path, message: `${label} 必须是数字`, received: typeof value }];
    }

    const errors: ValidationError[] = [];

    if (this._integer && !Number.isInteger(value)) {
      errors.push({ path, message: `${label} 必须是整数`, received: value });
    }

    if (this._min !== undefined && value < this._min) {
      errors.push({
        path,
        message: `${label} 不能小于 ${this._min}（当前 ${value}）`,
        received: value,
      });
    }

    if (this._max !== undefined && value > this._max) {
      errors.push({
        path,
        message: `${label} 不能大于 ${this._max}（当前 ${value}）`,
        received: value,
      });
    }

    return errors;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 布尔 Schema
// ─────────────────────────────────────────────────────────────────────────────

export class BooleanSchema extends Schema<boolean> {
  _validate(value: unknown, path: string): ValidationError[] {
    const label = this._label ?? (path || "该字段");

    if (value === undefined || value === null) {
      if (this._optional) return [];
      return [{ path, message: `${label} 为必填项`, received: value }];
    }

    if (typeof value !== "boolean") {
      return [{ path, message: `${label} 必须是布尔值（true/false）`, received: typeof value }];
    }

    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 数组 Schema
// ─────────────────────────────────────────────────────────────────────────────

export class ArraySchema<Item> extends Schema<Item[]> {
  private _minItems?: number;
  private _maxItems?: number;

  constructor(private readonly itemSchema: Schema<Item>) {
    super();
  }

  /** 最少元素数量 */
  minItems(n: number): this {
    this._minItems = n;
    return this;
  }

  /** 最多元素数量 */
  maxItems(n: number): this {
    this._maxItems = n;
    return this;
  }

  _validate(value: unknown, path: string): ValidationError[] {
    const label = this._label ?? (path || "该字段");

    if (value === undefined || value === null) {
      if (this._optional) return [];
      return [{ path, message: `${label} 为必填项`, received: value }];
    }

    if (!Array.isArray(value)) {
      return [{ path, message: `${label} 必须是数组`, received: typeof value }];
    }

    const errors: ValidationError[] = [];

    if (this._minItems !== undefined && value.length < this._minItems) {
      errors.push({
        path,
        message: `${label} 至少需要 ${this._minItems} 个元素（当前 ${value.length}）`,
        received: value.length,
      });
    }

    if (this._maxItems !== undefined && value.length > this._maxItems) {
      errors.push({
        path,
        message: `${label} 最多允许 ${this._maxItems} 个元素（当前 ${value.length}）`,
        received: value.length,
      });
    }

    // 递归校验每个元素
    for (let i = 0; i < value.length; i++) {
      const itemErrors = this.itemSchema._validate(value[i], `${path}[${i}]`);
      errors.push(...itemErrors);
    }

    return errors;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 对象 Schema
// ─────────────────────────────────────────────────────────────────────────────

/** 从 Schema 映射推断 TypeScript 类型 */
type InferShape<S extends Record<string, Schema<unknown>>> = {
  [K in keyof S]: S[K] extends Schema<infer T>
    ? S[K]["isOptional"] extends true
      ? T | undefined
      : T
    : never;
};

export class ObjectSchema<S extends Record<string, Schema<unknown>>> extends Schema<InferShape<S>> {
  private _allowUnknown = false;

  constructor(private readonly shape: S) {
    super();
  }

  /** 允许额外的未声明字段（默认不允许） */
  allowUnknownFields(): this {
    this._allowUnknown = true;
    return this;
  }

  _validate(value: unknown, path: string): ValidationError[] {
    const label = this._label ?? (path || "该字段");

    if (value === undefined || value === null) {
      if (this._optional) return [];
      return [{ path, message: `${label} 为必填项`, received: value }];
    }

    if (typeof value !== "object" || Array.isArray(value)) {
      return [{ path, message: `${label} 必须是对象`, received: typeof value }];
    }

    const obj = value as Record<string, unknown>;
    const errors: ValidationError[] = [];

    // 校验未知字段
    if (!this._allowUnknown) {
      const knownKeys = new Set(Object.keys(this.shape));
      for (const key of Object.keys(obj)) {
        if (!knownKeys.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `不允许的字段 "${key}"`,
            received: key,
          });
        }
      }
    }

    // 校验每个声明字段
    for (const [key, fieldSchema] of Object.entries(this.shape)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const fieldErrors = (fieldSchema as Schema<unknown>)._validate(obj[key], fieldPath);
      errors.push(...fieldErrors);
    }

    return errors;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema 构建器（流式 API 入口）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema 构建器命名空间。
 *
 * @example
 * ```ts
 * const schema = v.object({
 *   name: v.string().minLength(1).maxLength(100),
 *   age:  v.number().min(0).max(150).integer().optional(),
 *   tags: v.array(v.string()).maxItems(10).optional(),
 * });
 * ```
 */
export const v = {
  /** 字符串校验器 */
  string: (): StringSchema => new StringSchema(),
  /** 数字校验器 */
  number: (): NumberSchema => new NumberSchema(),
  /** 布尔校验器 */
  boolean: (): BooleanSchema => new BooleanSchema(),
  /** 数组校验器 */
  array: <T>(itemSchema: Schema<T>): ArraySchema<T> => new ArraySchema(itemSchema),
  /** 对象校验器 */
  object: <S extends Record<string, Schema<unknown>>>(shape: S): ObjectSchema<S> =>
    new ObjectSchema(shape),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 顶层校验函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 执行 Schema 校验。
 *
 * @param schema 校验 Schema
 * @param value 待校验值
 * @returns `ValidationResult<T>`
 *
 * @example
 * ```ts
 * const result = validate(ChatSchema, requestBody);
 * if (!result.ok) {
 *   // result.errors: ValidationError[]
 *   sendError(res, 400, "VALIDATION_ERROR", result.errors[0].message);
 *   return;
 * }
 * // result.data — 类型安全
 * const { message, threadId } = result.data;
 * ```
 */
export function validate<T>(schema: Schema<T>, value: unknown): ValidationResult<T> {
  const errors = schema._validate(value, "");
  if (errors.length === 0) {
    return { ok: true, data: value as T };
  }
  return { ok: false, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// 内置 API Schema（Dream XI 平台专用）
// ─────────────────────────────────────────────────────────────────────────────

/** 平台支持的球员 ID 列表 */
const PLAYER_IDS = ["leo", "andre", "flash", "wall", "gate"] as const;

/**
 * POST /api/chat 请求体 Schema。
 *
 * @example
 * ```ts
 * import { ChatRequestSchema, validate } from "@dream-xi/validator";
 * const result = validate(ChatRequestSchema, body);
 * ```
 */
export const ChatRequestSchema = v.object({
  message: v.string().minLength(1).maxLength(4000).label("消息内容"),
  threadId: v.string().optional().label("线程 ID"),
  playerId: v.string().oneOf(PLAYER_IDS).optional().label("指定球员"),
  options: v
    .object({
      stream: v.boolean().optional().label("流式输出"),
      temperature: v.number().min(0).max(2).optional().label("温度参数"),
      maxTokens: v.number().min(1).max(32768).integer().optional().label("最大 Token 数"),
      systemHint: v.string().maxLength(500).optional().label("系统提示补充"),
    })
    .optional()
    .label("请求选项"),
});

/**
 * POST /api/threads 请求体 Schema。
 */
export const CreateThreadSchema = v.object({
  title: v.string().minLength(1).maxLength(200).optional().label("线程标题"),
  participants: v
    .array(v.string().oneOf([...PLAYER_IDS, "coach"]))
    .optional()
    .label("参与者"),
});

/**
 * POST /api/memory 写入记忆请求体 Schema。
 */
export const WriteMemorySchema = v.object({
  playerId: v.string().oneOf(PLAYER_IDS).label("球员 ID"),
  layer: v.string().oneOf(["episodic", "semantic"]).label("记忆层级"),
  content: v.string().minLength(1).maxLength(10000).label("记忆内容"),
  tags: v.array(v.string().maxLength(50)).maxItems(20).optional().label("标签"),
});

/**
 * GET /api/memory/search 查询参数 Schema。
 */
export const SearchMemorySchema = v.object({
  playerId: v.string().oneOf(PLAYER_IDS).label("球员 ID"),
  q: v.string().minLength(1).maxLength(500).label("搜索关键词"),
  limit: v.number().min(1).max(50).integer().optional().label("返回数量"),
});

/**
 * 将 ValidationError[] 格式化为 HTTP 响应体中的 errors 字段。
 *
 * @example
 * ```ts
 * if (!result.ok) {
 *   sendJson(res, {
 *     ok: false,
 *     error: { code: "VALIDATION_ERROR", message: "请求参数有误" },
 *     details: formatValidationErrors(result.errors),
 *   }, 400, requestId);
 * }
 * ```
 */
export function formatValidationErrors(
  errors: ValidationError[],
): Array<{ field: string; message: string }> {
  return errors.map((e) => ({
    field: e.path || "body",
    message: e.message,
  }));
}

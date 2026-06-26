/**
 * @dream-xi/config — 环境变量读取器（Env Reader）
 *
 * 从 process.env 读取原始字符串值，并提供类型安全的访问工具。
 * 与 .env.example 中定义的所有变量完全对应。
 *
 * 参考：.env.example
 */

// ─────────────────────────────────────────────────────────────────────────────
// 读取工具函数
// ─────────────────────────────────────────────────────────────────────────────

/** 读取字符串环境变量（可选） */
export function readString(key: string): string | undefined {
  const val = process.env[key];
  return val === "" ? undefined : val;
}

/** 读取字符串环境变量（必填，缺失时抛出） */
export function requireString(key: string): string {
  const val = readString(key);
  if (val === undefined) {
    throw new ConfigError(`缺少必填环境变量：${key}（请检查 .env 文件）`);
  }
  return val;
}

/** 读取整数环境变量 */
export function readInt(key: string, defaultValue: number): number {
  const val = readString(key);
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) {
    throw new ConfigError(`环境变量 ${key} 必须是整数，实际值：${val}`);
  }
  return parsed;
}

/** 读取布尔环境变量（"true" / "1" / "yes" 视为 true） */
export function readBool(key: string, defaultValue: boolean): boolean {
  const val = readString(key);
  if (val === undefined) return defaultValue;
  return ["true", "1", "yes", "on"].includes(val.toLowerCase());
}

/** 读取逗号分隔的字符串列表 */
export function readList(key: string, defaultValue: string[] = []): string[] {
  const val = readString(key);
  if (val === undefined) return defaultValue;
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 读取逗号分隔的整数列表 */
export function readIntList(key: string, defaultValue: number[] = []): number[] {
  const list = readList(key, []);
  if (list.length === 0) return defaultValue;
  return list.map((s) => {
    const n = parseInt(s, 10);
    if (Number.isNaN(n)) throw new ConfigError(`环境变量 ${key} 包含非整数值：${s}`);
    return n;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 配置错误
// ─────────────────────────────────────────────────────────────────────────────

/** 配置加载错误 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

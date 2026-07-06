/**
 * @dream-xi/utils — 通用辅助工具库
 *
 * 为 Dream XI AI 模块提供基础辅助函数：
 * - 判断对象类型、深拷贝与深合并
 * - 从对象中提取/剔除指定键值对
 * - 异步等待（带 AbortSignal 支持）
 * - 进程内自增与随机 UUID 生成
 */

/** 判断一个值是否为普通对象 */
export function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && !Array.isArray(item);
}

/** 深度合并多个对象 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Array<Partial<T>>
): T {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const val = source[key];
        if (isObject(val)) {
          if (!target[key]) {
            Object.assign(target, { [key]: {} });
          }
          deepMerge(target[key] as Record<string, unknown>, val);
        } else {
          Object.assign(target, { [key]: val });
        }
      }
    }
  }

  return deepMerge(target, ...sources);
}

/** 从对象中提取指定属性，返回新对象 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/** 从对象中剔除指定属性，返回新对象 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/** 生成随机的 UUID (RFC4122 v4 简易版) */
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 自增 ID 计数器，方便进程内产生可读性高的 ID */
let counter = 0;
export function nextId(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}`;
}

/** 异步延迟函数，支持 AbortSignal 取消 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }

    const timer = setTimeout(() => {
      resolve();
    }, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

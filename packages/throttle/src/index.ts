/**
 * @dream-xi/throttle — 频次控制工具包
 *
 * 提供轻量级的函数节流 (Throttle) 和防抖 (Debounce) 控制，
 * 用于平抑 Agent 在执行高频监测或轮询工具时的触发频次。
 */

export interface ThrottleOptions {
  /** 是否在开始边界触发 */
  leading?: boolean;
  /** 是否在结束边界触发 */
  trailing?: boolean;
}

export interface DebounceOptions {
  /** 是否立即触发（在开始边界） */
  immediate?: boolean;
}

/**
 * 创建一个节流函数
 *
 * @param fn 执行的原始函数
 * @param wait 限制的时间间隔（毫秒）
 * @param options 节流配置
 */
export function throttle<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  wait: number,
  options: ThrottleOptions = {},
): (...args: Args) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;
  const leading = options.leading ?? true;
  const trailing = options.trailing ?? true;

  return function (this: unknown, ...args: Args): void {
    const now = Date.now();
    if (!previous && !leading) previous = now;
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      fn.apply(this, args);
    } else if (!timeout && trailing) {
      timeout = setTimeout(() => {
        previous = leading ? Date.now() : 0;
        timeout = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * 创建一个防抖函数
 *
 * @param fn 执行的原始函数
 * @param wait 延迟触发的时间（毫秒）
 * @param options 防抖配置
 */
export function debounce<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  wait: number,
  options: DebounceOptions = {},
): (...args: Args) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const immediate = options.immediate ?? false;

  return function (this: unknown, ...args: Args): void {
    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      if (!immediate) {
        fn.apply(this, args);
      }
    }, wait);

    if (callNow) {
      fn.apply(this, args);
    }
  };
}

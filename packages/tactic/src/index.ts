/**
 * @dream-xi/tactic
 *
 * 战术框架：内置战术注册、加载、冲突检测、系统提示注入。
 */

export { BUILTIN_TACTICS, BUILTIN_TACTICS_MAP } from "./builtin-tactics.js";
export {
  TacticRegistry,
  PlayerTacticSlot,
  detectTriggers,
} from "./tactic-loader.js";
export type { LoadResult, UnloadResult } from "./tactic-loader.js";

import { BUILTIN_TACTICS } from "./builtin-tactics.js";
import { TacticRegistry } from "./tactic-loader.js";

/**
 * 创建预加载全部内置战术的全局注册表
 *
 * @example
 * ```ts
 * import { createDefaultRegistry, PlayerTacticSlot } from "@dream-xi/tactic";
 *
 * const registry = createDefaultRegistry();
 * const slot = new PlayerTacticSlot("andre", registry);
 * slot.load("tdd", "explicit");
 * ```
 */
export function createDefaultRegistry(): TacticRegistry {
  const registry = new TacticRegistry();
  registry.registerAll(BUILTIN_TACTICS);
  return registry;
}


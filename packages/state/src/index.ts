/**
 * @dream-xi/state — 状态机管理包
 *
 * 为 Dream XI AI 球员和工作流提供有限状态机 (FSM) 实现，
 * 支持类型安全的生命周期控制、转换守卫和生命周期回调。
 */

export interface Transition<S extends string, E extends string> {
  from: S | S[];
  to: S;
  on: E;
}

export interface StateMachineConfig<S extends string, E extends string> {
  initial: S;
  transitions: Transition<S, E>[];
  onTransition?: (from: S, to: S, event: E) => void | Promise<void>;
  onBeforeTransition?: (from: S, to: S, event: E) => boolean | Promise<boolean>;
}

/**
 * 有限状态机 (Finite State Machine) 类
 *
 * @template S 状态联合类型，例如 "idle" | "busy" | "error"
 * @template E 事件联合类型，例如 "start" | "success" | "fail"
 */
export class StateMachine<S extends string, E extends string> {
  private _current: S;
  private readonly config: StateMachineConfig<S, E>;

  constructor(config: StateMachineConfig<S, E>) {
    this._current = config.initial;
    this.config = config;
  }

  /** 获取当前状态 */
  get current(): S {
    return this._current;
  }

  /**
   * 触发事件进行状态转换
   *
   * @param event 事件名称
   */
  async transition(event: E): Promise<boolean> {
    const matched = this.config.transitions.find((t) => {
      if (Array.isArray(t.from)) {
        return t.from.includes(this._current) && t.on === event;
      }
      return t.from === this._current && t.on === event;
    });

    if (!matched) {
      throw new Error(`Invalid event "${event}" on state "${this._current}"`);
    }

    const from = this._current;
    const to = matched.to;

    // 执行转换前的守卫检查
    if (this.config.onBeforeTransition) {
      const allowed = await this.config.onBeforeTransition(from, to, event);
      if (!allowed) return false;
    }

    this._current = to;

    // 触发转换后回调
    if (this.config.onTransition) {
      await this.config.onTransition(from, to, event);
    }

    return true;
  }

  /**
   * 判断当前状态是否可以触发指定事件
   *
   * @param event 事件名称
   */
  can(event: E): boolean {
    return this.config.transitions.some((t) => {
      if (Array.isArray(t.from)) {
        return t.from.includes(this._current) && t.on === event;
      }
      return t.from === this._current && t.on === event;
    });
  }
}

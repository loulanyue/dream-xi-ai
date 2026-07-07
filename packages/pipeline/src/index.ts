/**
 * @dream-xi/pipeline — Agent 工作流执行管道
 *
 * 提供轻量级的顺序（Sequential）和并行（Parallel）步骤组合执行引擎，
 * 用于构建可复用的 AI 工作流 Pipeline。
 *
 * @example 顺序执行
 * ```ts
 * const pipeline = new Pipeline<string>([
 *   { name: "trim",    run: (ctx) => ctx.trim() },
 *   { name: "upper",   run: (ctx) => ctx.toUpperCase() },
 * ]);
 * const result = await pipeline.run("  hello  ");
 * // => "HELLO"
 * ```
 *
 * @example 并行步骤
 * ```ts
 * const step = parallelStep("fetch-all", [
 *   { name: "a", run: async (ctx) => { ... } },
 *   { name: "b", run: async (ctx) => { ... } },
 * ]);
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

/** Pipeline 步骤执行结果 */
export interface StepResult<T> {
  /** 步骤名称 */
  name: string;
  /** 步骤输出值 */
  output: T;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 是否执行成功 */
  success: boolean;
  /** 若失败，记录错误信息 */
  error?: string;
}

/** Pipeline 执行摘要 */
export interface PipelineResult<T> {
  /** 最终输出 */
  output: T;
  /** 每步执行记录 */
  steps: StepResult<T>[];
  /** 总耗时（毫秒） */
  totalMs: number;
  /** 是否全部步骤成功 */
  success: boolean;
}

/** 单个 Pipeline 步骤定义 */
export interface PipelineStep<T> {
  /** 步骤标识名称（用于日志） */
  name: string;
  /**
   * 步骤执行函数，接收上下文值，返回新的上下文值（或 Promise）
   */
  run: (context: T) => T | Promise<T>;
  /**
   * 可选：步骤执行前的条件守卫，返回 false 则跳过该步骤
   */
  when?: (context: T) => boolean | Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline 类
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 顺序步骤执行管道
 *
 * 每个步骤接收上一步的输出作为上下文输入，依次串行执行。
 *
 * @template T 管道上下文类型（初始输入和步骤间传递的数据类型）
 */
export class Pipeline<T> {
  private readonly steps: PipelineStep<T>[];

  constructor(steps: PipelineStep<T>[]) {
    this.steps = steps;
  }

  /**
   * 从初始值开始，依次执行所有步骤
   *
   * @param initialContext 初始上下文值
   */
  async run(initialContext: T): Promise<PipelineResult<T>> {
    const startedAt = Date.now();
    let current = initialContext;
    const stepResults: StepResult<T>[] = [];
    let allSuccess = true;

    for (const step of this.steps) {
      // 执行条件守卫
      if (step.when) {
        const shouldRun = await step.when(current);
        if (!shouldRun) {
          stepResults.push({
            name: step.name,
            output: current,
            durationMs: 0,
            success: true,
          });
          continue;
        }
      }

      const stepStart = Date.now();
      try {
        const output = await step.run(current);
        const durationMs = Date.now() - stepStart;
        stepResults.push({
          name: step.name,
          output,
          durationMs,
          success: true,
        });
        current = output;
      } catch (err) {
        const durationMs = Date.now() - stepStart;
        const errorMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({
          name: step.name,
          output: current,
          durationMs,
          success: false,
          error: errorMsg,
        });
        allSuccess = false;
        throw err; // 顺序执行遇到错误立即中断
      }
    }

    return {
      output: current,
      steps: stepResults,
      totalMs: Date.now() - startedAt,
      success: allSuccess,
    };
  }

  /**
   * 向管道末尾添加一个新步骤，返回新管道实例（不可变）
   */
  pipe(step: PipelineStep<T>): Pipeline<T> {
    return new Pipeline([...this.steps, step]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具：并行步骤组
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将多个步骤包装成一个并行执行的单一步骤
 *
 * 所有子步骤并发执行，最终上下文取最后一个子步骤的输出（适合副作用类操作）。
 *
 * @param name 并行步骤组名称
 * @param steps 并行执行的子步骤列表
 */
export function parallelStep<T>(name: string, steps: PipelineStep<T>[]): PipelineStep<T> {
  return {
    name,
    run: async (context: T): Promise<T> => {
      const results = await Promise.allSettled(steps.map((s) => s.run(context)));
      // 取最后一个成功的步骤输出，若全部失败则抛出第一个错误
      let lastOutput: T = context;
      for (const result of results) {
        if (result.status === "fulfilled") {
          lastOutput = result.value;
        }
      }
      const firstFailed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (firstFailed && results.every((r) => r.status === "rejected")) {
        throw firstFailed.reason instanceof Error
          ? firstFailed.reason
          : new Error(String(firstFailed.reason));
      }
      return lastOutput;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具：条件步骤
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建一个带条件守卫的步骤（语法糖）
 *
 * @param name 步骤名称
 * @param when 条件判断函数
 * @param run  执行函数
 */
export function conditionalStep<T>(
  name: string,
  when: (context: T) => boolean | Promise<boolean>,
  run: (context: T) => T | Promise<T>,
): PipelineStep<T> {
  return { name, when, run };
}

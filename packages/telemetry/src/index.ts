/**
 * @dream-xi/telemetry — 指标与性能遥测工具包
 *
 * 为 Dream XI AI 平台提供轻量级的运行时性能与资源消耗监测：
 * - 大模型调用耗时（Span）
 * - 大模型输入输出 Token 数追踪
 * - 缓存命中率计数 (Hit / Miss)
 */

export interface MetricRecord {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface Span {
  name: string;
  startedAt: number;
  tags?: Record<string, string>;
}

/**
 * 遥测指标收集与监测类
 */
export class TelemetryTracker {
  private readonly metrics: MetricRecord[] = [];
  private readonly activeSpans = new Map<string, Span>();

  /**
   * 开始测量一段耗时（Span）
   *
   * @param name 测量任务名称（如 "llm_call"）
   * @param tags 关联的标签
   * @returns 结束测量的回调函数，自动记录耗时指标
   */
  startSpan(name: string, tags?: Record<string, string>): () => number {
    const spanId = `${name}-${Date.now()}-${Math.random()}`;
    this.activeSpans.set(spanId, {
      name,
      startedAt: Date.now(),
      ...(tags !== undefined ? { tags } : {}),
    });

    return () => {
      const active = this.activeSpans.get(spanId);
      if (!active) return 0;
      this.activeSpans.delete(spanId);
      const duration = Date.now() - active.startedAt;
      this.record(name, duration, active.tags);
      return duration;
    };
  }

  /**
   * 记录一项通用数值指标
   *
   * @param name 指标名称（如 "tokens_total"）
   * @param value 数值
   * @param tags 关联标签
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    const record: MetricRecord = {
      name,
      value,
      timestamp: Date.now(),
      ...(tags !== undefined ? { tags } : {}),
    };
    this.metrics.push(record);
  }

  /**
   * 汇总指定指标名称的统计信息 (Sum, Average, Count, Max)
   */
  summary(name: string): { sum: number; avg: number; count: number; max: number } {
    const filtered = this.metrics.filter((m) => m.name === name);
    if (filtered.length === 0) {
      return { sum: 0, avg: 0, count: 0, max: 0 };
    }

    const sum = filtered.reduce((s, m) => s + m.value, 0);
    const count = filtered.length;
    const max = Math.max(...filtered.map((m) => m.value));

    return {
      sum,
      count,
      avg: sum / count,
      max,
    };
  }

  /** 获取所有已收集的指标 */
  getAllMetrics(): MetricRecord[] {
    return [...this.metrics];
  }

  /** 清空指标统计 */
  reset(): void {
    this.metrics.length = 0;
    this.activeSpans.clear();
  }
}

/** 全局统一遥测监测单例 */
export const telemetry = new TelemetryTracker();

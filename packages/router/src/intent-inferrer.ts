/**
 * @dream-xi/router — 意图推断器（Intent Inferrer）
 *
 * 当消息没有显式 @mention 时，根据消息内容自动推断
 * 最合适的球员来处理任务。
 *
 * 推断策略（优先级从高到低）：
 *   1. 显式 @mention（由 mention-parser 处理，此模块不涉及）
 *   2. 关键词匹配（基于每名球员的能力标签）
 *   3. 默认路由 → Leo (#10 队长)
 *
 * 参考：docs/SOP.md § 传球规则
 * 参考：docs/ARCHITECTURE.md § ADR-003 A2A 消息路由设计
 */

import type { PlayerId } from "@dream-xi/types";

/** 每名球员的关键词 → 权重映射 */
const PLAYER_KEYWORDS: Record<PlayerId, Array<{ pattern: RegExp; weight: number }>> = {
  leo: [
    { pattern: /架构|设计|方案|规划|系统|整体|模块|拆解|分析|复杂/u, weight: 3 },
    { pattern: /architecture|design|plan|system|module|complex|strategy/i, weight: 3 },
    { pattern: /怎么做|如何|思路|建议|评估|可行性/u, weight: 2 },
    { pattern: /review|审查|评审/u, weight: 1 },
  ],
  andre: [
    { pattern: /审查|review|代码质量|code review|检查|安全|漏洞|vulnerability/i, weight: 4 },
    { pattern: /测试|test|单元测试|集成测试|覆盖率|coverage/i, weight: 3 },
    { pattern: /bug|错误|问题|fix|修复|defect/i, weight: 2 },
    { pattern: /依赖|dependency|版本|version|升级|upgrade/i, weight: 2 },
  ],
  flash: [
    { pattern: /设计|ui|界面|样式|动画|交互|视觉|原型|prototype/i, weight: 4 },
    { pattern: /创意|想法|灵感|idea|brainstorm|头脑风暴/u, weight: 3 },
    { pattern: /快速|快点|迅速|速度|demo|演示|展示/u, weight: 2 },
    { pattern: /css|tailwind|figma|sketch|设计稿/i, weight: 3 },
  ],
  wall: [
    { pattern: /部署|deploy|运维|docker|k8s|kubernetes|nginx|服务器/i, weight: 4 },
    { pattern: /基础设施|infrastructure|ci\/?cd|流水线|pipeline/i, weight: 4 },
    { pattern: /配置|config|环境|environment|env|脚本|script/i, weight: 2 },
    { pattern: /性能|performance|优化|optimize|监控|monitor/i, weight: 2 },
  ],
  gate: [
    { pattern: /门禁|quality gate|检查|lint|格式|format/i, weight: 4 },
    { pattern: /合并|merge|pr|pull request|发布|release/i, weight: 3 },
  ],
};

/** 意图推断结果 */
export interface InferenceResult {
  /** 推断出的目标球员 */
  target: PlayerId;
  /** 推断置信度（0-1） */
  confidence: number;
  /** 是否为默认路由（无明确匹配时回退到队长） */
  isDefault: boolean;
  /** 各球员得分（调试用） */
  scores: Record<PlayerId, number>;
}

/**
 * 根据消息内容推断最合适的球员
 *
 * @param text 消息文本（已去除 @mention）
 * @returns 推断结果
 *
 * @example
 * ```ts
 * inferIntent("帮我做一下代码审查");
 * // → { target: "andre", confidence: 0.8, isDefault: false, scores: {...} }
 *
 * inferIntent("你好");
 * // → { target: "leo", confidence: 0.0, isDefault: true, scores: {...} }
 * ```
 */
export function inferIntent(text: string): InferenceResult {
  const scores: Record<PlayerId, number> = {
    leo: 0,
    andre: 0,
    flash: 0,
    wall: 0,
    gate: 0,
  };

  // 计算每名球员的关键词匹配得分
  for (const [playerId, patterns] of Object.entries(PLAYER_KEYWORDS) as Array<
    [PlayerId, typeof PLAYER_KEYWORDS[PlayerId]]
  >) {
    for (const { pattern, weight } of patterns) {
      const matchCount = (text.match(pattern) ?? []).length;
      scores[playerId] += matchCount * weight;
    }
  }

  // 找出最高分
  const entries = Object.entries(scores) as Array<[PlayerId, number]>;
  const [topPlayer, topScore] = entries.reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ["leo" as PlayerId, 0] as [PlayerId, number],
  );

  // 计算最大可能得分（用于归一化置信度）
  const maxPossibleScore = 12; // 经验值：约 3 个高权重命中
  const confidence = Math.min(topScore / maxPossibleScore, 1);
  const isDefault = topScore === 0;

  return {
    target: isDefault ? "leo" : topPlayer,
    confidence: isDefault ? 0 : confidence,
    isDefault,
    scores,
  };
}

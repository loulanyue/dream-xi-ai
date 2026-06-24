/**
 * @dream-xi/router — @mention 解析器
 *
 * 从消息文本中提取所有 @mention 标记，返回球员 ID 列表。
 * 解析规则：
 *   - `@leo` → "leo"
 *   - `@andre` → "andre"
 *   - `@flash` → "flash"
 *   - `@wall` → "wall"
 *   - 大小写不敏感，支持后跟空格或标点
 *
 * 参考：docs/SOP.md § 传球规则（A2A 通信）
 */

import type { PlayerId } from "@dream-xi/types";

/** 所有球员 @mention 关键词（支持中英文别名） */
const MENTION_MAP: Record<string, PlayerId> = {
  // 英文 ID
  leo: "leo",
  andre: "andre",
  flash: "flash",
  wall: "wall",
  gate: "gate",
  // 中文别名
  里奥: "leo",
  安德: "andre",
  弗拉什: "flash",
  沃尔: "wall",
  门将: "gate",
  // 位置别名
  队长: "leo",
  中场: "andre",
  前锋: "flash",
  后卫: "wall",
};

/** @mention 解析结果 */
export interface MentionParseResult {
  /** 提取到的球员 ID 列表（保持顺序，去重） */
  mentions: PlayerId[];
  /** 去掉 @mention 后的纯文本内容 */
  cleanedText: string;
}

/**
 * 从消息文本中解析 @mention
 *
 * @example
 * ```ts
 * parseMentions("@leo 请帮我设计架构，@andre 负责审查");
 * // → { mentions: ["leo", "andre"], cleanedText: "请帮我设计架构，负责审查" }
 * ```
 */
export function parseMentions(text: string): MentionParseResult {
  const mentions: PlayerId[] = [];
  const seen = new Set<PlayerId>();

  // 匹配 @keyword（支持中文、英文，后跟空格/标点/行尾）
  const mentionRegex = /@([\w\u4e00-\u9fa5]+)/g;
  let cleanedText = text;

  for (const match of text.matchAll(mentionRegex)) {
    const keyword = match[1]?.toLowerCase() ?? "";
    const playerId = MENTION_MAP[keyword] ?? MENTION_MAP[match[1] ?? ""];

    if (playerId !== undefined && !seen.has(playerId)) {
      mentions.push(playerId);
      seen.add(playerId);
    }
  }

  // 移除所有 @mention 标记，清理多余空白
  cleanedText = text
    .replace(/@[\w\u4e00-\u9fa5]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { mentions, cleanedText };
}

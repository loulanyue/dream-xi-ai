/**
 * @dream-xi/parser — LLM 响应解析器
 *
 * 为 Dream XI AI 模块和球员提供提取与解析结构化大模型回复的辅助方法：
 * - 提取 Markdown 格式代码块中的 JSON 对象/数组
 * - 按 Markdown 二/三级标题分割文本，解析成段落结构 (Sections)
 * - 简易的 `Key: Value` 或 `Key=Value` 行解析器
 */

/**
 * 提取并解析 Markdown 代码块中的第一个 JSON
 *
 * @param text 包含 Markdown 代码块的 LLM 原始文本
 */
export function parseJsonBlock<T = unknown>(text: string): T {
  // 匹配 ```json ... ``` 块，支持不规范的缩写如 ```
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonContent = match ? match[1] : text;

  if (!jsonContent) {
    throw new Error("No JSON content found in LLM response");
  }

  try {
    return JSON.parse(jsonContent.trim()) as T;
  } catch (err) {
    // 降级尝试：寻找第一个 { 或 [ 到最后一个 } 或 ]
    const firstBrace = jsonContent.indexOf("{");
    const firstBracket = jsonContent.indexOf("[");
    let startIdx = -1;
    let endChar = "";

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endChar = "}";
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endChar = "]";
    }

    if (startIdx !== -1) {
      const lastIdx = jsonContent.lastIndexOf(endChar);
      if (lastIdx > startIdx) {
        const sliced = jsonContent.slice(startIdx, lastIdx + 1);
        try {
          return JSON.parse(sliced) as T;
        } catch {
          // ignore, throw original err
        }
      }
    }

    throw new Error(
      `Failed to parse extracted JSON content: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Markdown 章节结构 */
export interface MarkdownSection {
  title: string;
  content: string;
  level: number;
}

/**
 * 按照标题 (# / ## / ###) 将 Markdown 文档分割为键值对或结构化列表
 *
 * @param text Markdown 文档文本
 */
export function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;
  const currentContent: string[] = [];

  const flush = () => {
    if (currentSection) {
      currentSection.content = currentContent.join("\n").trim();
      sections.push(currentSection);
      currentContent.length = 0;
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch?.[1] && headingMatch[2]) {
      flush();
      currentSection = {
        level: headingMatch[1].length,
        title: headingMatch[2].trim(),
        content: "",
      };
    } else {
      currentContent.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * 按行解析 `Key: Value` 或 `Key=Value` 为对象字典
 *
 * @param text 文本行集合
 * @param separator 键值对分隔符，默认冒号或等号
 */
export function parseKeyValueLines(
  text: string,
  separator: RegExp = /[:=]/,
): Record<string, string> {
  const lines = text.split(/\r?\n/);
  const result: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue; // 跳过空行和注释
    }

    const index = trimmed.search(separator);
    if (index !== -1) {
      const key = trimmed.slice(0, index).trim();
      const val = trimmed.slice(index + 1).trim();
      if (key) {
        result[key] = val;
      }
    }
  }

  return result;
}

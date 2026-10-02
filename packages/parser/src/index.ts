/**
 * @dream-xi/parser — LLM 响应解析器
 *
 * 为 Dream XI AI 模块和球员提供提取与解析结构化大模型回复的辅助方法：
 * - 提取 Markdown 格式代码块中的 JSON 对象/数组
 * - 自动容错清洗单行/多行注释与尾随逗号 (Trailing Commas)
 * - 按 Markdown 二/三级标题分割文本，解析成段落结构 (Sections)
 * - 简易的 `Key: Value` 或 `Key=Value` 行解析器
 */

/**
 * 清洗大模型输出中常见的非标准 JSON 特征：
 * 1. 单行与多行注释（保留字符串内部如 URL "https://..." 不受影响）
 * 2. 数组和对象尾部多余的逗号 (Trailing commas，如 `{"a": 1,}` 或 `[1, 2, ]`)
 */
export function sanitizeJsonString(raw: string): string {
  let inString = false;
  let stringChar = "";
  let isEscaped = false;
  let cleaned = "";

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = i + 1 < raw.length ? raw[i + 1] : "";

    if (inString) {
      cleaned += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === "\\") {
        isEscaped = true;
      } else if (ch === stringChar) {
        inString = false;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        cleaned += '"'; // 标准化为双引号
      } else if (ch === "/" && next === "/") {
        // 单行注释：跳过至行尾
        while (i < raw.length && raw[i] !== "\n" && raw[i] !== "\r") {
          i++;
        }
        if (i < raw.length) cleaned += raw[i];
      } else if (ch === "/" && next === "*") {
        // 多行注释：跳过至 */
        i += 2;
        while (i < raw.length && !(raw[i] === "*" && i + 1 < raw.length && raw[i + 1] === "/")) {
          i++;
        }
        i++; // 跳过 '/'
      } else {
        cleaned += ch;
      }
    }
  }

  // 清洗尾随逗号 (Trailing commas): 匹配逗号后仅跟可选空白并紧接闭合括号 } 或 ]
  return cleaned.replace(/,\s*([}\]])/g, "$1");
}

/**
 * 提取并解析 Markdown 代码块中的第一个 JSON，自带大模型常见格式缺陷清洗容错
 *
 * @param text 包含 Markdown 代码块或纯 JSON 的 LLM 原始文本
 */
export function parseJsonBlock<T = unknown>(text: string): T {
  // 匹配 ```json ... ``` 块，支持不规范的缩写如 ```
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonContent = match ? match[1] : text;

  if (!jsonContent) {
    throw new Error("No JSON content found in LLM response");
  }

  const trimmed = jsonContent.trim();

  // 1. 尝试直接标准 JSON.parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // 2. 尝试清洗注释与尾随逗号后解析
    try {
      const sanitized = sanitizeJsonString(trimmed);
      return JSON.parse(sanitized) as T;
    } catch {
      // 3. 降级尝试：寻找第一个 { 或 [ 到最后一个 } 或 ]，再进行切片与清洗解析
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
            try {
              const sanitizedSlice = sanitizeJsonString(sliced);
              return JSON.parse(sanitizedSlice) as T;
            } catch {
              // 继续向下抛出异常
            }
          }
        }
      }

      throw new Error(
        `Failed to parse extracted JSON content: syntax error even after sanitizing comments and trailing commas`,
      );
    }
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

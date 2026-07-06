/**
 * @dream-xi/prompt — 提示词模板引擎
 *
 * 为 Dream XI AI 的每个球员(Agent)提供动态组装提示词的工具。
 * 支持带变量解析的模板渲染，以及面向系统提示词组装的构造型 Builder。
 */

export interface SystemPromptSection {
  title: string;
  content: string;
}

/**
 * 提示词模板类
 *
 * 解析包含 `{{variable}}` 的模板字符串，并进行参数替换。
 */
export class PromptTemplate {
  private readonly variables: string[] = [];

  constructor(public readonly template: string) {
    const matches = template.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
    for (const match of matches) {
      const variable = match[1];
      if (variable && !this.variables.includes(variable)) {
        this.variables.push(variable);
      }
    }
  }

  /** 获取模板中包含的所有变量名 */
  getVariableNames(): string[] {
    return [...this.variables];
  }

  /**
   * 渲染模板
   *
   * @param params 变量参数映射表
   */
  render(params: Record<string, string>): string {
    let result = this.template;
    for (const name of this.variables) {
      const val = params[name];
      if (val === undefined) {
        throw new Error(`Missing required prompt parameter: "${name}"`);
      }
      result = result.replaceAll(`{{${name}}}`, val);
    }
    return result;
  }
}

/**
 * 系统提示词组装器
 *
 * 采用结构化方式（如标题、分段、列表）动态拼接大型 System Prompt，
 * 适用于将规则、战术、上下文与动态任务进行有机结合。
 */
export class SystemPromptBuilder {
  private readonly sections: SystemPromptSection[] = [];
  private readonly rules: string[] = [];

  constructor(private readonly introduction: string) {}

  /** 添加结构化主题分段 */
  addSection(title: string, content: string): this {
    this.sections.push({ title, content });
    return this;
  }

  /** 添加扁平的单条规则/规范约束 */
  addRule(rule: string): this {
    this.rules.push(rule);
    return this;
  }

  /** 编译并输出完整的提示词字符串 */
  build(): string {
    const parts: string[] = [this.introduction];

    if (this.rules.length > 0) {
      parts.push("\n## 约束与纪律 (RULES)");
      for (let i = 0; i < this.rules.length; i++) {
        const rule = this.rules[i];
        if (rule) parts.push(`${i + 1}. ${rule}`);
      }
    }

    for (const section of this.sections) {
      parts.push(`\n## ${section.title}\n${section.content}`);
    }

    return parts.join("\n");
  }
}

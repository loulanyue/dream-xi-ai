import { ContextWindow, type MessageRole } from "@dream-xi/context";
import { dreamXiBus } from "@dream-xi/pubsub";

export interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  maxTokens?: number;
}

export type AgentState = "idle" | "thinking" | "executing" | "error";

/**
 * Dream XI AI 基础 Agent 类
 *
 * 封装了 Agent 的身份标识、对话上下文窗口以及状态转移机制。
 */
export class Agent {
  public readonly name: string;
  public readonly role: string;
  public readonly context: ContextWindow;
  private _state: AgentState = "idle";

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.role = config.role;
    this.context = new ContextWindow({
      maxTokens: config.maxTokens ?? 16000,
      systemPrompt: config.systemPrompt,
    });
  }

  /** 获取当前 Agent 的运行状态 */
  get state(): AgentState {
    return this._state;
  }

  /**
   * 模拟 Agent 思考/执行逻辑（具体 LLM 调用由子类或运行时引擎实现）
   */
  async think(
    prompt: string,
    llmCall: (messages: Array<{ role: MessageRole; content: string }>) => Promise<string>,
  ): Promise<string> {
    this._state = "thinking";
    this.context.addUser(prompt);

    const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 发布开始请求事件
    await dreamXiBus.publish("llm.request", {
      taskId,
      model: "dream-xi-core-model",
      promptHash: String(prompt.length),
    });

    const startedAt = Date.now();
    try {
      if (this.context.overBudget) {
        await this.context.compress();
      }

      this._state = "executing";
      const response = await llmCall(this.context.toMessages());

      this.context.addAssistant(response);
      this._state = "idle";

      // 发布请求成功事件
      await dreamXiBus.publish("llm.response", {
        taskId,
        durationMs: Date.now() - startedAt,
        tokensUsed: prompt.length + response.length,
      });

      return response;
    } catch (err) {
      this._state = "error";
      const errMsg = err instanceof Error ? err.message : String(err);

      // 发布请求失败事件
      await dreamXiBus.publish("llm.error", {
        taskId,
        error: errMsg,
        retryable: false,
      });
      throw err;
    }
  }

  /** 重置 Agent 上下文 */
  reset(): void {
    this.context.clear();
    this._state = "idle";
  }
}

import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";

/**
 * Model Context Protocol (MCP) JSON-RPC 2.0 基础消息接口
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpClientOptions {
  /** 初始化请求时的客户端元数据 */
  clientInfo?: {
    name: string;
    version: string;
  };
}

/**
 * Model Context Protocol (MCP) 客户端实现
 *
 * 通过 stdio (标准输入输出) 连接并驱动外部的 MCP Tool 服务器。
 */
export class McpClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private readonly pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (err: unknown) => void;
    }
  >();

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly options: McpClientOptions = {},
  ) {}

  /**
   * 启动外部服务器进程并建立 stdio 连接
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.command, this.args, {
          stdio: ["pipe", "pipe", "inherit"],
          env: process.env,
        });

        if (!this.process.stdout || !this.process.stdin) {
          throw new Error("Failed to initialize stdin/stdout streams for MCP server");
        }

        const rl = createInterface({
          input: this.process.stdout,
        });

        rl.on("line", (line) => {
          this._handleLine(line);
        });

        this.process.on("error", (err) => {
          reject(err);
        });

        this.process.on("exit", (code) => {
          this._cleanup(new Error(`MCP server process exited with code ${code}`));
        });

        // 进行 MCP 初始化握手
        const clientName = this.options.clientInfo?.name ?? "dream-xi-mcp-client";
        const clientVersion = this.options.clientInfo?.version ?? "0.1.0-alpha";

        this.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: clientName, version: clientVersion },
        })
          .then(() => {
            // 发送 initialized 通知
            this._sendNotification("notifications/initialized");
            resolve();
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  async listTools(): Promise<McpTool[]> {
    const res = await this.request("tools/list", {});
    return (res as { tools?: McpTool[] })?.tools ?? [];
  }

  /**
   * 调用指定的 MCP 工具
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.request("tools/call", {
      name,
      arguments: args,
    });
  }

  /**
   * 发送 JSON-RPC 请求并等待响应
   */
  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error("MCP Client is not connected"));
      }

      const id = ++this.requestId;
      const req: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(`${JSON.stringify(req)}\n`);
    });
  }

  /**
   * 关闭与 MCP 服务器的连接
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this._cleanup(new Error("Client disconnected"));
  }

  private _sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process || !this.process.stdin) return;
    const notification = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    };
    this.process.stdin.write(`${JSON.stringify(notification)}\n`);
  }

  private _handleLine(line: string): void {
    try {
      const response: JsonRpcResponse = JSON.parse(line);
      if (response.id !== undefined && response.id !== null) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(
              new Error(`MCP error: ${response.error.message} (code: ${response.error.code})`),
            );
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch (err) {
      console.error("[McpClient] failed to parse incoming line:", err);
    }
  }

  private _cleanup(err: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }
}

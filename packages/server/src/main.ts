import { loadConfig } from "@dream-xi/config";
import { createDreamXiServer } from "./index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 命令行参数解析
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isMemoryMode = args.includes("--memory");
const _isDaemonMode = args.includes("--daemon");

// 内存模式：覆盖 REDIS_URL，强制使用内存后端
if (isMemoryMode) {
  // biome-ignore lint/complexity/useLiteralKeys: process.env needs bracket notation under strict ts config
  process.env["REDIS_URL"] = undefined;
  // biome-ignore lint/complexity/useLiteralKeys: process.env needs bracket notation under strict ts config
  process.env["MEMORY_BACKEND"] = "memory";
}

// ─────────────────────────────────────────────────────────────────────────────
// 启动横幅
// ─────────────────────────────────────────────────────────────────────────────

function printBanner(port: number, memoryMode: boolean): void {
  const _lines = [
    "",
    "  ⚽  D R E A M   X I   A I",
    "  ─────────────────────────────────────────",
    `  🌐  HTTP  → http://localhost:${port}`,
    `  🧠  Memory → ${memoryMode ? "In-Memory（重启后丢失）" : "Redis（持久化）"}`,
    "  🛡️  Fair Play Guard → 已启动",
    "  🔀  A2A Router     → 已启动",
    "",
    "  端点速查：",
    `  GET  http://localhost:${port}/health`,
    `  POST http://localhost:${port}/api/chat`,
    `  GET  http://localhost:${port}/api/players`,
    `  GET  http://localhost:${port}/api/tactics`,
    `  GET  http://localhost:${port}/api/threads`,
    "",
    "  「铁律纪律 · 创造自由 · 同一支队伍」",
    "  ─────────────────────────────────────────",
    "",
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 主启动函数
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 步骤 1：加载并验证配置
  let config: ReturnType<typeof loadConfig>["config"];
  try {
    const result = loadConfig({
      strict: true, // 配置有误时阻止启动
      printReport: true, // 打印球员上场/替补席情况
    });
    config = result.config;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 配置加载失败，服务器无法启动：\n${msg}\n`);
    console.error("💡 提示：复制 .env.example → .env，并填写至少一名球员的 API Key。\n");
    process.exit(1);
  }

  // 步骤 2：创建 HTTP 服务器（含所有平台包初始化）
  const server = createDreamXiServer(config);
  const { port } = config.server;

  // 步骤 3：启动监听
  await new Promise<void>((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(`\n❌ 端口 ${port} 已被占用。`);
        console.error("   请修改 .env 中的 PORT 配置，或先停止占用该端口的进程。\n");
      } else {
        console.error(`\n❌ 服务器启动失败：${err.message}\n`);
      }
      reject(err);
    });

    server.listen(port, () => {
      printBanner(port, isMemoryMode);
      resolve();
    });
  });

  // 步骤 4：注册优雅退出（Graceful Shutdown）
  const shutdown = (_signal: string): void => {
    server.close((err) => {
      if (err !== undefined) {
        console.error("退出时发生错误：", err);
        process.exit(1);
      }
      process.exit(0);
    });

    // 超时强制退出（10 秒）
    setTimeout(() => {
      console.error("⏰ 优雅退出超时，强制退出。");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // 未捕获异常保底处理（避免进程崩溃）
  process.on("uncaughtException", (err) => {
    console.error("💥 未捕获异常（进程继续运行）：", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("💥 未处理的 Promise 拒绝（进程继续运行）：", reason);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 启动
// ─────────────────────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error("💥 服务器意外崩溃：", err);
  process.exit(1);
});

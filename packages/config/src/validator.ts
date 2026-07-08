/**
 * @dream-xi/config — 配置验证器（Config Validator）
 *
 * 对加载的配置进行完整性校验，识别缺失的必填项和合规问题。
 * 输出已配置的球员列表和在替补席的球员列表。
 *
 * 参考：docs/SETUP.md
 * 参考：@dream-xi/types ConfigValidationResult
 */

import type { ConfigValidationResult, DreamXiConfig, PlayerId } from "@dream-xi/types";

/** 已知的球员 ID 列表 */
const PLAYER_IDS: PlayerId[] = ["leo", "andre", "flash", "wall"];

/**
 * 验证完整的平台配置
 *
 * @param config 已加载的配置对象
 * @returns 验证结果（含错误、警告、球员上场状态）
 */
export function validateConfig(config: DreamXiConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ─── 服务器配置 ────────────────────────────────────────────────────────
  if (config.server.port < 1024 || config.server.port > 65535) {
    errors.push(`PORT 必须在 1024-65535 范围内，当前值：${config.server.port}`);
  }

  if (!config.server.baseUrl.startsWith("http")) {
    errors.push("BASE_URL 必须以 http:// 或 https:// 开头");
  }

  // ─── 安全配置 ──────────────────────────────────────────────────────────
  if (config.security.jwtSecret.length < 32) {
    errors.push(
      `JWT_SECRET 长度不足（当前 ${config.security.jwtSecret.length} 字符，至少需要 32 字符）`,
    );
  }

  if (config.security.jwtSecret === "change-me" || config.security.jwtSecret === "secret") {
    errors.push("JWT_SECRET 使用了默认值，请生成一个随机密钥");
  }

  // ─── 存储配置 ──────────────────────────────────────────────────────────
  if (config.memory.backend === "redis") {
    if (config.memory.redisUrl === undefined || config.memory.redisUrl === "") {
      errors.push("存储后端设置为 redis 但 REDIS_URL 未配置");
    } else if (
      !config.memory.redisUrl.startsWith("redis://") &&
      !config.memory.redisUrl.startsWith("rediss://")
    ) {
      warnings.push(
        `REDIS_URL 格式异常：${config.memory.redisUrl}（应以 redis:// 或 rediss:// 开头）`,
      );
    }
  }

  if (config.memory.backend === "memory") {
    warnings.push("使用内存模式（--memory）：重启后所有记忆将丢失，不建议用于生产环境");
  }

  // ─── 球员配置（至少一个球员需要配置） ──────────────────────────────────
  const configuredPlayers: PlayerId[] = [];
  const benchedPlayers: PlayerId[] = [];

  for (const playerId of PLAYER_IDS) {
    const playerConfig = config.players[playerId];
    if (playerConfig !== undefined && playerConfig.apiKey !== "") {
      configuredPlayers.push(playerId);
    } else {
      benchedPlayers.push(playerId);
    }
  }

  if (configuredPlayers.length === 0) {
    errors.push(
      "没有配置任何球员的 API Key。至少需要配置一名球员（推荐：ANTHROPIC_API_KEY=sk-xxx）",
    );
  }

  if (benchedPlayers.length > 0) {
    warnings.push(`以下球员因未配置 API Key 将在替补席：${benchedPlayers.join(", ")}`);
  }

  // ─── MCP 端口冲突检测 ───────────────────────────────────────────────────
  if (config.server.port === config.mcp.port) {
    errors.push(
      `服务端口（PORT=${config.server.port}）与 MCP 端口（MCP_PORT=${config.mcp.port}）冲突`,
    );
  }

  // ─── 集成配置完整性 ─────────────────────────────────────────────────────
  const feishu = config.integrations.feishu;
  if (feishu?.enabled === true) {
    if (!feishu.appId || !feishu.appSecret) {
      errors.push("飞书集成已启用但 FEISHU_APP_ID 或 FEISHU_APP_SECRET 未配置");
    }
    if (!feishu.verificationToken) {
      warnings.push("飞书集成未配置 FEISHU_VERIFICATION_TOKEN，Webhook 安全验证将失效");
    }
  }

  const github = config.integrations.github;
  if (github?.enabled === true) {
    if (!github.clientId || !github.clientSecret) {
      errors.push("GitHub 集成已启用但 GITHUB_CLIENT_ID 或 GITHUB_CLIENT_SECRET 未配置");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    configuredPlayers,
    benchedPlayers,
  };
}

/**
 * 格式化验证结果为人类可读的启动日志
 */
export function formatValidationReport(result: ConfigValidationResult): string {
  const lines: string[] = ["", "═══════════════════ Dream XI 配置检查 ═══════════════════"];

  if (result.valid) {
    lines.push("✅ 配置验证通过，球队准备就绪！");
  } else {
    lines.push(`❌ 配置验证失败（${result.errors.length} 个错误）`);
  }

  lines.push("");
  lines.push(
    `⚽ 上场球员（${result.configuredPlayers.length}）：${result.configuredPlayers.join("、") || "无"}`,
  );
  lines.push(
    `🪑 替补席（${result.benchedPlayers.length}）：${result.benchedPlayers.join("、") || "无"}`,
  );

  if (result.errors.length > 0) {
    lines.push("", "🚫 错误（必须修复）：");
    for (const e of result.errors) lines.push(`   • ${e}`);
  }

  if (result.warnings.length > 0) {
    lines.push("", "⚠️  警告（建议处理）：");
    for (const w of result.warnings) lines.push(`   • ${w}`);
  }

  lines.push("═══════════════════════════════════════════════════════", "");
  return lines.join("\n");
}

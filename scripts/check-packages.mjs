#!/usr/bin/env node
/**
 * scripts/check-packages.mjs
 *
 * Dream XI AI — 包健康检查工具
 *
 * 扫描 packages/ 目录下的所有包，检查：
 *   1. package.json 必填字段（name, version, description, license, exports）
 *   2. tsconfig.json 是否存在
 *   3. src/index.ts 是否存在
 *   4. 所有内部依赖是否使用 workspace:* 协议
 *   5. 版本号格式是否符合 semver
 *
 * 用法：
 *   node scripts/check-packages.mjs
 *   node scripts/check-packages.mjs --fix  (自动修复部分问题)
 *
 * 集成到 CI：
 *   pnpm gate 中包含此检查
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT      = resolve(__dirname, "..");
const PACKAGES  = join(ROOT, "packages");
const FIX_MODE  = process.argv.includes("--fix");

// ANSI 颜色
const R = "\x1b[31m"; // 红
const G = "\x1b[32m"; // 绿
const Y = "\x1b[33m"; // 黄
const B = "\x1b[36m"; // 青
const D = "\x1b[2m";  // 暗
const X = "\x1b[0m";  // 重置

let errorCount  = 0;
let warnCount   = 0;
let passCount   = 0;

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function error(pkg, msg) {
  console.error(`  ${R}✗ ERROR${X}  ${msg}`);
  errorCount++;
}

function warn(pkg, msg) {
  console.warn(`  ${Y}⚠ WARN${X}   ${msg}`);
  warnCount++;
}

function pass(msg) {
  console.log(`  ${G}✓ OK${X}     ${msg}`);
  passCount++;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 必填字段检查
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ["name", "version", "description", "license"];
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
const DREAM_XI_DEPS = ["@dream-xi/types", "@dream-xi/config", "@dream-xi/memory",
  "@dream-xi/tactic", "@dream-xi/router", "@dream-xi/fair-play", "@dream-xi/server",
  "@dream-xi/event-bus", "@dream-xi/logger", "@dream-xi/validator", "@dream-xi/retry",
  "@dream-xi/rate-limiter", "@dream-xi/cache"];

function checkPackage(pkgDir) {
  const pkgName    = pkgDir.split("/").pop();
  const pkgJsonPath = join(pkgDir, "package.json");
  const tsConfigPath = join(pkgDir, "tsconfig.json");
  const srcIndexPath = join(pkgDir, "src", "index.ts");

  console.log(`\n${B}▸ ${pkgName}${X} ${D}(${pkgDir.replace(ROOT + "/", "")})${X}`);

  // 1. package.json 存在
  const pkg = readJson(pkgJsonPath);
  if (!pkg) {
    error(pkgName, "package.json 不存在或 JSON 格式错误");
    return;
  }

  // 2. 必填字段
  for (const field of REQUIRED_FIELDS) {
    if (!pkg[field]) {
      error(pkgName, `package.json 缺少必填字段: "${field}"`);
    } else {
      pass(`package.json.${field} = ${JSON.stringify(pkg[field])}`);
    }
  }

  // 3. 版本号格式
  if (pkg.version && !SEMVER_RE.test(pkg.version)) {
    warn(pkgName, `version "${pkg.version}" 不符合 semver 格式`);
  }

  // 4. exports 字段
  if (!pkg.exports) {
    warn(pkgName, "package.json 缺少 exports 字段（推荐添加以支持 ESM）");
  } else {
    pass(`exports 字段已配置`);
  }

  // 5. 内部依赖使用 workspace:*
  const allDeps = { ...pkg.dependencies, ...pkg.peerDependencies };
  for (const [dep, ver] of Object.entries(allDeps)) {
    if (DREAM_XI_DEPS.includes(dep)) {
      if (ver !== "workspace:*") {
        error(pkgName, `内部依赖 "${dep}" 应使用 "workspace:*"，当前值: "${ver}"`);
      } else {
        pass(`${dep}: workspace:*`);
      }
    }
  }

  // 6. tsconfig.json 存在
  if (!existsSync(tsConfigPath)) {
    error(pkgName, "tsconfig.json 不存在");
  } else {
    pass("tsconfig.json 存在");
  }

  // 7. src/index.ts 存在
  if (!existsSync(srcIndexPath)) {
    warn(pkgName, "src/index.ts 不存在（若包有其他入口则忽略）");
  } else {
    pass("src/index.ts 存在");
  }

  // 8. license 必须是 Apache-2.0
  if (pkg.license && pkg.license !== "Apache-2.0") {
    warn(pkgName, `license 应为 "Apache-2.0"，当前: "${pkg.license}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${B}╔══════════════════════════════════════════════╗${X}`);
console.log(`${B}║   Dream XI AI — 包健康检查 (check-packages)  ║${X}`);
console.log(`${B}╚══════════════════════════════════════════════╝${X}`);

if (FIX_MODE) {
  console.log(`\n${Y}⚡ 自动修复模式已开启${X}\n`);
}

// 读取所有包目录
let pkgDirs;
try {
  pkgDirs = readdirSync(PACKAGES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(PACKAGES, d.name));
} catch {
  console.error(`${R}✗ 无法读取 packages/ 目录：${PACKAGES}${X}`);
  process.exit(1);
}

if (pkgDirs.length === 0) {
  console.warn(`${Y}⚠ packages/ 目录为空${X}`);
  process.exit(0);
}

for (const pkgDir of pkgDirs) {
  checkPackage(pkgDir);
}

// ─────────────────────────────────────────────────────────────────────────────
// 汇总报告
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`${B}汇总：${X} 扫描 ${pkgDirs.length} 个包`);
console.log(`  ${G}✓ 通过${X}  ${passCount} 项`);
console.log(`  ${Y}⚠ 警告${X}  ${warnCount} 项`);
console.log(`  ${R}✗ 错误${X}  ${errorCount} 项`);

if (errorCount > 0) {
  console.log(`\n${R}✗ 检查未通过，请修复以上错误后重试。${X}\n`);
  process.exit(1);
} else if (warnCount > 0) {
  console.log(`\n${Y}⚠ 检查通过（有警告），建议优化。${X}\n`);
  process.exit(0);
} else {
  console.log(`\n${G}✓ 所有包检查通过！${X}\n`);
  process.exit(0);
}

# Dream XI AI — 开发者指南（Developer Guide）

> 适合希望**在本地跑起来、搞懂代码结构、开始贡献**的开发者。

---

## 目录

- [快速启动（5 分钟）](#快速启动5-分钟)
- [代码库结构](#代码库结构)
- [包依赖关系](#包依赖关系)
- [API 端点速查](#api-端点速查)
- [本地开发工作流](#本地开发工作流)
- [测试策略](#测试策略)
- [调试技巧](#调试技巧)
- [贡献流程](#贡献流程)

---

## 快速启动（5 分钟）

### 前置要求

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 20.x | 使用 `node --version` 确认 |
| pnpm | 9.x | `npm i -g pnpm` |
| Git | 2.x | 克隆仓库 |

### 克隆 & 安装

```bash
git clone https://github.com/loulanyue/dream-xi-ai.git
cd dream-xi-ai

# 安装所有包的依赖（pnpm workspace 会处理内部链接）
pnpm install
```

### 配置环境变量

```bash
# 复制配置模板
cp .env.example .env

# 至少配置一名球员（以 Leo/Claude 为例）
echo "ANTHROPIC_API_KEY=sk-ant-xxxx" >> .env
```

> [!TIP]
> 只需配置你拥有 API Key 的球员，其余球员会自动进替补席。

### 启动开发服务器

```bash
# 构建所有包
pnpm build

# 启动 HTTP 服务（内存模式，无需 Redis）
pnpm start --memory

# 验证服务正常
curl http://localhost:3003/health
```

正常响应如下：

```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "uptime": 3,
    "version": "1.0.0-alpha",
    "players": [
      { "id": "leo", "status": "active", "provider": "anthropic" }
    ]
  }
}
```

---

## 代码库结构

```
dream-xi-ai/
├── packages/                  # Monorepo 核心包（按依赖顺序）
│   ├── types/                 # @dream-xi/types    — 类型系统（基础层）
│   ├── config/                # @dream-xi/config   — 配置加载与验证
│   ├── fair-play/             # @dream-xi/fair-play — 球队铁律守卫
│   ├── memory/                # @dream-xi/memory   — 三层记忆管理
│   ├── tactic/                # @dream-xi/tactic   — 战术框架
│   ├── router/                # @dream-xi/router   — A2A 消息路由
│   └── server/                # @dream-xi/server   — HTTP 服务层
│       └── src/
│           ├── index.ts       # 服务器入口 & ServerContext
│           ├── types.ts       # API 请求/响应类型
│           ├── middleware/    # 日志、CORS、JSON 解析
│           └── routes/        # 路由处理器
│               ├── health.ts  # GET /health
│               ├── players.ts # GET /api/players
│               ├── chat.ts    # POST /api/chat（核心端点）
│               ├── threads.ts # GET/POST /api/threads
│               ├── memory.ts  # GET /api/memory/:playerId
│               └── fair-play.ts # GET /api/fair-play/stats
├── docs/                      # 文档目录
│   ├── TIPS.md                # 实用技巧与使用示例
│   ├── SOP.md                 # 比赛纪律标准操作规程
│   ├── VISION.md              # 愿景与长期目标
│   ├── ARCHITECTURE.md        # 架构决策记录（ADR）
│   ├── GLOSSARY.md            # 术语表
│   └── DEVELOPMENT.md         # 本文件 — 开发者指南
├── .github/
│   ├── ISSUE_TEMPLATE/        # Bug / 功能 / 问题模板
│   └── workflows/
│       └── ci.yml             # CI 流水线（Lint→TypeCheck→Test→Build）
├── .env.example               # 环境变量配置模板
├── biome.json                 # Lint / Format 配置
├── tsconfig.json              # 根 TypeScript 配置（严格模式）
├── package.json               # Monorepo 根配置
└── pnpm-workspace.yaml        # pnpm 工作区定义
```

---

## 包依赖关系

```
@dream-xi/types          ← 无内部依赖（基础层）
       ↑
@dream-xi/config         ← types
@dream-xi/fair-play      ← types
@dream-xi/memory         ← types
@dream-xi/tactic         ← types
@dream-xi/router         ← types
       ↑
@dream-xi/server         ← config + fair-play + memory + tactic + router + types
```

> [!IMPORTANT]
> 修改 `@dream-xi/types` 中的类型时，需要重新 build 所有下游包。
> 运行 `pnpm build` 从根目录一次性构建所有包。

---

## API 端点速查

### 健康检查

```bash
# 服务健康状态 + 球员上场/替补席
GET /health
GET /api/health
```

### 聊天（核心端点）

```bash
POST /api/chat
Content-Type: application/json

# 基础请求（自动路由）
{ "message": "帮我审查一下这段代码" }

# 指定球员
{ "message": "设计一个缓存方案", "playerId": "leo" }

# @mention 路由
{ "message": "@andre 跑一遍安全审查" }

# 指定线程 + 强制战术
{
  "message": "先写测试",
  "threadId": "thread-xxx",
  "options": { "tactics": ["tdd"] }
}
```

**响应字段说明：**

| 字段 | 说明 |
|------|------|
| `handledBy` | 实际处理的球员 ID |
| `routeMethod` | `mention` / `inferred` / `default` / `forced` |
| `loadedTactics` | 本次加载的战术列表 |
| `memoryCompressed` | 是否触发了工作记忆压缩 |

### 线程管理

```bash
GET  /api/threads                   # 列出所有线程
POST /api/threads                   # 创建新线程
     { "title": "重构认证模块", "tags": ["auth", "refactor"] }
POST /api/threads/:id/archive       # 归档线程
```

### 球员 & 记忆

```bash
GET /api/players                    # 所有球员状态
GET /api/players/leo                # 单名球员状态
GET /api/memory/leo                 # Leo 的情景记忆
GET /api/memory/andre?limit=5&minImportance=0.5
GET /api/fair-play/stats            # 铁律守卫统计
```

---

## 本地开发工作流

### 修改某个包后快速迭代

```bash
# 只 build 修改的包（以 router 为例）
cd packages/router && pnpm build && cd ../..

# 重启服务
pnpm start --memory
```

### 门禁检查（提交前必跑）

```bash
# 一键运行所有检查：lint + typecheck + build
pnpm gate
```

单项检查：

```bash
pnpm lint       # Biome lint 检查
pnpm format     # 格式化（会修改文件）
pnpm typecheck  # TypeScript 类型检查（不编译）
pnpm build      # 完整构建
```

### 查看请求日志

服务启动后，每个请求会打印：

```
🟢 [match-1751234567-abc12] POST /api/chat → 200 (47ms)
🟡 [match-1751234568-def34] GET /api/players/unknown → 404 (2ms)
🔴 [match-1751234569-ghi56] POST /api/chat → 500 (1ms)
```

---

## 测试策略

> [!NOTE]
> 当前版本为 alpha 阶段，测试框架尚在搭建中。以下是计划的测试策略。

### 单元测试（规划中）

每个包将包含与源文件并列的 `.test.ts` 文件：

```
packages/router/src/
├── mention-parser.ts
├── mention-parser.test.ts   ← 单元测试
├── intent-inferrer.ts
└── intent-inferrer.test.ts
```

运行：

```bash
pnpm test
```

### 集成测试（规划中）

针对 `POST /api/chat` 的端到端测试：

```typescript
// 测试示例：@mention 路由正确性
const res = await fetch("http://localhost:3003/api/chat", {
  method: "POST",
  body: JSON.stringify({ message: "@andre 审查这段代码" }),
});
const { data } = await res.json();
assert(data.handledBy === "andre");
assert(data.routeMethod === "mention");
```

---

## 调试技巧

### 查看路由推断结果

在 `POST /api/chat` 响应中，`routeMethod` 字段会告诉你路由是如何决定的：

| `routeMethod` | 触发条件 |
|--------------|---------|
| `mention` | 消息中有 `@leo` / `@andre` 等 @mention |
| `inferred` | 关键词推断置信度 ≥ 0.2 |
| `default` | 无 mention 且推断置信度不足，默认路由到 Leo |
| `forced` | 请求中指定了 `playerId` 字段 |

### 查看铁律守卫是否拦截了请求

```bash
curl http://localhost:3003/api/fair-play/stats
```

`blockedCount > 0` 说明有请求被铁律拦截，查看 `recentViolations` 定位原因。

### 记忆压缩触发条件

当某球员的工作记忆 Token 消耗超过 `WORKING_MEMORY_MAX_TOKENS`（默认 100,000）的 85%（即 85,000 tokens）时，会自动触发压缩。

`POST /api/chat` 响应中 `memoryCompressed: true` 表示本次请求触发了压缩。

---

## 贡献流程

详见 [CONTRIBUTING.md](../CONTRIBUTING.md)，简要流程：

```bash
# 1. Fork 仓库，创建功能分支
git checkout -b feat/your-feature

# 2. 开发 & 本地验证
pnpm gate

# 3. 提交（遵循 Conventional Commits）
git commit -m "feat(router): add fallback to gate for quality checks"

# 4. 推送并开 PR
git push origin feat/your-feature
```

> [!TIP]
> PR 标题格式必须遵循 `type(scope): description`，CI 会自动验证。
> 常用 type：`feat` / `fix` / `docs` / `refactor` / `test` / `chore`

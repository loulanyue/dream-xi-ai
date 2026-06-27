# Changelog

变更记录遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## 版本策略

- `PATCH`：不破坏兼容性的 Bug 修复、文档更新
- `MINOR`：向后兼容的新功能、新球员接入
- `MAJOR`：破坏性变更，需要用户迁移

---

## [1.4.5-alpha] - 2026-06-27

> 🪵 基础设施赛季 — `@dream-xi/logger` · 结构化日志 · JSON Lines · 零依赖

### Added

- **`packages/logger/`**：结构化日志包（新建包，零外部依赖）
  - `packages/logger/src/index.ts`：`Logger` 类完整实现
    - **6 个日志级别**：`trace(10)` / `debug(20)` / `info(30)` / `warn(40)` / `error(50)` / `fatal(60)`
    - **双输出格式**：
      - `"json"`：紧凑 JSON Lines（生产推荐，机器可解析）
      - `"pretty"`：带颜色 + 时间戳的可读格式（开发推荐，自动检测 `NODE_ENV`）
      - `"silent"`：无输出（测试专用）
    - **方法重载**：`log.info("msg")` 或 `log.info({ field }, "msg")` 两种签名
    - **`child(bindings)`**：创建子 Logger，继承父配置 + 追加固定字段
    - **`isLevelEnabled(level)`**：跳过昂贵参数计算的守卫方法
    - **Error 序列化**：`err` 字段自动序列化为 `{ type, message, stack, code }`
    - **流可替换**：`stdout` / `stderr` 可注入任意 `Writable`（测试友好）
    - `createLogger(options)`：工厂函数，自动按 `NODE_ENV` 选择格式和级别
    - `logRequest(logger, entry)`：HTTP 请求日志工具函数（按状态码选级别）
    - `getRootLogger()`：全局根 Logger 单例
    - `setRootLogger(logger)`：替换根 Logger（初始化/测试用）
  - `packages/logger/package.json`：包配置（**零 runtime 依赖**）
  - `packages/logger/tsconfig.json`：TypeScript 编译配置

### Notes

- `@dream-xi/logger` 不依赖 `@dream-xi/types`，可作为最底层基础包被任意包引用
- `pretty` 格式使用 ANSI 转义码，终端不支持颜色时建议设置 `format: "json"`

---

## [1.5.0-alpha] - 2026-06-29

> 📡 事件总线赛季 — `@dream-xi/event-bus` · InMemoryEventBus · eventFactory

### Added

- **`packages/event-bus/`**：事件总线实现包（新建包）
  - `packages/event-bus/src/index.ts`：`InMemoryEventBus` 完整实现
    - `emit(event)`：异步并发通知所有匹配订阅者，单个失败不中断其他订阅者
    - `subscribe(filter, handler)`：返回可取消 `EventSubscription` 令牌
    - `once(filter, handler)`：一次性订阅，触发后自动注销
    - `waitFor(type, timeoutMs?)`：Promise 风格等待事件，支持超时 reject
    - `subscriberCount()`：当前活跃订阅者数量（调试用）
    - `clear()`：清除所有订阅者（测试清理用）
    - `snapshot()`：返回所有订阅者快照（id / types / once / createdAt）
    - `totalEmitted`：总发布事件次数统计
    - `createEventBus(options?)`：工厂函数，支持 `debug` / `handlerTimeoutMs` / `maxSubscribers` 配置
    - `getGlobalEventBus()`：进程级单例（开发环境自动开启 debug）
    - `resetGlobalEventBus()`：单例重置（测试专用）
  - `packages/event-bus/src/factory.ts`：`eventFactory` 类型安全工厂
    - 覆盖全部 20 种平台事件，自动填充 `id` / `timestamp` / `version`
    - 调用者只需传入业务 `payload`，无需手动构造基础字段
  - `packages/event-bus/package.json`：包配置（依赖 `@dream-xi/types workspace:*`）
  - `packages/event-bus/tsconfig.json`：TypeScript 编译配置

### Architecture

```
@dream-xi/types          ← 事件类型定义（接口层）
       ↑
@dream-xi/event-bus      ← 事件总线实现（本次新增）
       ↑
@dream-xi/server         ← 在 main.ts 中集成事件发布
```

---

## [0.2.0-alpha] - 2026-06-20

> 🔌 基础设施赛季（第零节）— 事件系统类型 · 平台事件总线接口

### Added

- **`packages/types/src/event.ts`**：平台事件系统完整类型定义（新增文件）
  - `DreamXiEvent` 基类：所有事件均携带 `id`、`type`、`timestamp`、`version` 四个必填字段
  - `EventType` 联合类型：23 种平台事件，覆盖消息、线程、记忆、公平竞技、系统五大领域
  - 命名规范：`<领域>.<动词>.<状态>`（如 `message.route.resolved`）
  - 23 个具体事件接口（discriminated union），均为全 `readonly` 不可变值对象
  - `AnyDreamXiEvent` 联合类型：支持 TypeScript 类型 narrow 到具体事件
  - `EventBus` 接口：`emit` / `subscribe` / `once` / `waitFor` / `subscriberCount` / `clear`
  - `EventFilter`：支持精确类型匹配和通配符 `"*"` 过滤
  - `EventSubscription`：可取消订阅令牌（`unsubscribe()`）
  - `EventHandler<T>`：泛型事件处理回调，支持同步/异步
  - `EventFactory` 接口：6 个常用事件的工厂方法类型

### Changed

- **`packages/types/src/index.ts`**：新增事件系统类型导出（23 个事件接口 + 5 个基础类型 + 2 个接口）
  - `import type { AnyDreamXiEvent, EventBus } from "@dream-xi/types"` 可用

---

## [1.4.0-alpha] - 2026-06-26

> ⚡ 服务器赛季（第四节）— 战术 API · 服务器启动入口 · `dream-xi` CLI

### Added

- **`packages/server/src/routes/tactics.ts`**：战术查询 API（新增文件）
  - `GET /api/tactics` — 列出所有可用战术（含分类过滤 `?category=`）
  - `GET /api/tactics/search?q=` — 按关键词搜索战术名称/描述
  - `GET /api/tactics/:id` — 获取单条战术完整详情（含 `systemPrompt`）
  - `TacticSummary` 视图：列表页隐藏 `systemPrompt`，保护提示词安全
- **`packages/server/src/main.ts`**：服务器真实启动入口（新增文件）
  - CLI 参数支持：`--memory`（开启 in-memory 模式）、`--daemon`（守护进程模式）
  - ASCII 横幅 + 端口/端点列表启动输出
  - `loadConfig` 严格模式验证，配置错误提前退出
  - `EADDRINUSE` 端口占用友好检测
  - 优雅退出：`SIGTERM`/`SIGINT` 信号 + 10s 超时强制退出
  - `uncaughtException`/`unhandledRejection` 安全兜底

### Changed

- **`packages/server/src/index.ts`**：接入战术路由分发
  - `GET /api/tactics`、`GET /api/tactics/search`、`GET /api/tactics/:id` 进入路由表
  - 移除 `handleChat` 处的过期注释
- **`package.json`**（root）：版本 `0.3.0-alpha` → `1.4.0-alpha`
  - `start` 脚本从 `index.js` 改为 `main.js`
  - 新增 `start:memory` 脚本
  - 移除废弃的 `stop` / `start:status` 脚本
- **`packages/server/package.json`**：版本 `1.0.0-alpha` → `1.4.0-alpha`
  - 新增 `./main` exports 入口
  - 新增 `bin.dream-xi` 指向 `dist/main.js`（可全局安装为 CLI 工具）
  - `dev` 脚本改为 `node --watch dist/main.js --memory`

---

## [1.3.0-alpha] - 2026-06-26

> 📚 服务器赛季（第三节）— 文档整合 · 架构全景图 · 开发者指南

### Added

- **`docs/DEVELOPMENT.md`**：完整开发者指南（新增文件）
  - 5 分钟快速启动（克隆 → 配置 → 启动 → curl 验证）
  - 代码库结构说明（packages/ 目录树 + 每个文件职责）
  - 包依赖关系图（types 为基础层，server 依赖全部平台包）
  - API 端点速查（含 curl 示例 + 响应字段说明表）
  - 本地开发工作流（单包 build + `pnpm gate` 门禁检查）
  - 测试策略（单元测试 / 集成测试规划，含代码示例）
  - 调试技巧（路由方式判断、铁律拦截定位、记忆压缩触发条件）
  - 贡献流程速查（fork → branch → gate → PR）

### Changed

- **`README.md`** — Architecture 节升级：
  - ASCII 图 → **Mermaid 全景图**（含 Server / Platform / Agents 三层子图，节点带 emoji）
  - Learn More 区块新增 `docs/DEVELOPMENT.md` 链接
- **`docs/ROADMAP.md`** — 路线图更新：
  - 新增 **v1.2.0-alpha 里程碑完成记录**（7 包 × 11 端点全表）
  - 核心平台表新增「TypeScript 工程骨架」和「HTTP 服务层」✅ 条目
  - 下赛季目标升级为 v2.0.0-alpha，新增 P0 项：真实 LLM 接入 + 语义记忆层

---

## [1.2.0-alpha] - 2026-06-26

> 🌐 服务器赛季（第二节）— 全量 API 路由上线！

### Added

- **`packages/server/src/routes/`** — 完整 API 路由层：
  - **`chat.ts`** — `POST /api/chat` 完整聊天流水线（10 步）：
    1. JSON 请求体解析
    2. Fair Play 铁律守卫检查（403 拒绝违规请求）
    3. 自动创建/复用线程（`threadId` 可选）
    4. A2A 路由（@mention / 意图推断 / 强制 `playerId`）
    5. 情景记忆查询（最近 3 条，注入上下文）
    6. 战术关键词自动检测并加载（最多 2 个）
    7. 系统提示组装（身份 + 记忆上下文 + 战术提示）
    8. Stub 球员回复（含 LLM 接入 TODO 标记，v1.x 完成）
    9. 追加消息到工作记忆，检测是否触发压缩
    10. 返回 `ChatResponse`（handledBy / routeMethod / tokenUsage / loadedTactics）
  - **`threads.ts`** — 线程管理 API：
    - `GET /api/threads` — 按更新时间倒序列出所有线程
    - `POST /api/threads` — 创建新线程并自动设为活跃
    - `POST /api/threads/:id/archive` — 归档线程，自动为所有参与球员保存情景记忆摘要
  - **`memory.ts`** — `GET /api/memory/:playerId`
    - 支持 `?limit=N&minImportance=0.3` 查询参数
    - 返回情景记忆列表（摘要 / 关键决策 / 重要性 / 标签）
  - **`fair-play.ts`** — `GET /api/fair-play/stats`
    - 返回守卫统计（总检查 / 拦截 / 警告 / 放行 / 按铁律分类）
    - 最近 10 条违规记录（时间 / 球员 / 操作类型 / 目标 / 规则 / 严重等级）

---

## [1.1.0-alpha] - 2026-06-26

> 🌐 服务器赛季（第一节）— HTTP 服务骨架上线！

### Added

- **`packages/server/`** — `@dream-xi/server` HTTP 服务包（骨架）：
  - **`types.ts`**：全量 API 类型定义
    - `ApiResponse<T>` / `PaginatedResponse<T>` — 标准响应包装器
    - `HealthCheckResponse` — 健康检查（含球员上场/替补席状态）
    - `ChatRequest` / `ChatResponse` — 聊天 API（含路由方式、Token 统计、战术列表）
    - `ThreadSummary` / `CreateThreadRequest` — 线程管理
    - `PlayerStatusResponse` — 球员实时状态
    - `MemoryQueryResponse` — 情景记忆查询
    - `FairPlayStatsResponse` — 铁律守卫统计
  - **`middleware/index.ts`**：HTTP 中间件层（纯 Node.js，无框架）
    - `requestLogger`：请求日志（`match-{ts}-{rand}` 足球主题 requestId，状态色标 🟢🟡🔴）
    - `corsMiddleware`：CORS 处理（allowedOrigins 白名单 + OPTIONS 预检）
    - `parseJsonBody<T>()`：原生异步 JSON 请求体解析
    - `sendJson()` / `sendError()`：标准响应构建工具
  - **`routes/health.ts`**：`GET /health` / `GET /api/health`
    - 返回 uptime、各子系统状态、球员上场/替补席列表
  - **`routes/players.ts`**：`GET /api/players` / `GET /api/players/:id`
    - 返回 PlayerStatusResponse（含编号、位置、provider、战术槽）
  - **`src/index.ts`**：`createDreamXiServer()` 服务器工厂
    - `ServerContext` 单例：共享 guard / memory / router / tacticRegistry
    - 中间件链：requestLogger → corsMiddleware → 路由分发
    - 全路由表（动态 import chat/threads/memory/fair-play 路由）
    - 未处理错误捕获 → 500 标准响应

---

## [1.0.0-alpha] - 2026-06-25

> 🎉 战术赛季（第三节）— 配置加载器上线，全队 Ready！

### Added

- **`packages/config/`** — `@dream-xi/config` 平台配置加载器包：
  - **`env-reader.ts`**：类型安全的环境变量读取工具
    - `readString()` / `requireString()`（缺失时抛出 `ConfigError`）
    - `readInt()` / `readBool()` / `readList()` / `readIntList()`
    - `ConfigError`：配置错误专用异常类
  - **`validator.ts`**：配置完整性验证器
    - 端口范围校验（1024-65535）
    - JWT Secret 强度检查（≥32 字符，非默认值）
    - Redis URL 格式验证
    - 至少一名球员需配置 API Key
    - MCP 端口冲突检测
    - 飞书/GitHub 集成完整性校验
    - `formatValidationReport()`：格式化启动日志（含上场/替补席球员列表）
  - **`index.ts`**：`loadConfig()` 主加载函数
    - 自动从 `process.env` 读取全部 40+ 环境变量
    - 自动检测 Redis / 内存模式（有无 `REDIS_URL`）
    - 按需注入集成配置（有 `FEISHU_APP_ID` 才注入飞书配置）
    - `strict` 模式：验证失败时阻止服务启动
    - `printReport` 选项：控制是否打印启动配置报告

### 里程碑

至此，`packages/` 目录已完成 6 个核心包：

| 包 | 职责 |
|----|------|
| `@dream-xi/types` | 类型系统（类型定义） |
| `@dream-xi/router` | A2A 消息路由 |
| `@dream-xi/memory` | 三层记忆管理 |
| `@dream-xi/tactic` | 战术框架 |
| `@dream-xi/fair-play` | 球队铁律守卫 |
| `@dream-xi/config` | 平台配置加载 |

---

## [0.9.0-alpha] - 2026-06-25

> 🛡️ 战术赛季（第二节）— 球队铁律守卫上线！

### Added

- **`packages/fair-play/`** — `@dream-xi/fair-play` 球队铁律守卫包：
  - **`rules.ts`**：四条铁律完整定义（含名称、描述、严重等级、口号）
    - `data-sanctuary`（数据圣殿，block）：「那是比赛记录，我们不清场。」
    - `process-safety`（进程自保，block）：「教练站在那里，球队才能继续比赛。」
    - `config-readonly`（配置只读，block）：「战术板上的方案，不能在比赛中途改写。」
    - `port-boundary`（端口边界，warn）：「各守其位，不越位进攻。」
  - **`action-checker.ts`**：操作意图检测引擎
    - 7 种 `ActionType`：file-delete / file-write / command-execute / process-signal / network-request / db-operation / redis-operation
    - 四条铁律各自的意图模式匹配（路径模式、命令关键词、正则）
    - `checkAction()`：返回 `violations`（含 block/warn）和格式化 `rejectionMessage`
  - **`index.ts`**：`FairPlayGuard` 主守卫类
    - `check()`：检查并返回结果（不抛出）
    - `enforce()`：违规时抛出 `FairPlayViolationError`
    - `wrap()` / `wrapSync()`：包裹异步/同步操作（先检查再执行）
    - `getAuditLog()` / `getViolationLog()` / `getBlockedLog()`：审计日志
    - `getStats()`：检查次数、拦截次数、按铁律分类的违规统计
    - `createStrictGuard()`：生产环境全规则守卫
    - `createLenientGuard()`：开发/测试宽松守卫

---

## [0.8.0-alpha] - 2026-06-25

> 📋 战术赛季（第一节）— 战术框架上线！

### Added

- **`packages/tactic/`** — `@dream-xi/tactic` 战术框架包：
  - **`builtin-tactics.ts`**：8 种内置战术完整定义（含中英文系统提示注入）
    - `tdd`：TDD 战术（红-绿-重构循环，禁止无测试提交）
    - `code-review`：P1/P2/P3 分级审查清单（阻断合并 / 应修复 / 建议）
    - `security-review`：OWASP Top 10 + Dream XI 球队铁律合规检查
    - `architecture-design`：ADR 格式设计流程（边界→核心域→接口→权衡）
    - `rapid-prototype`：快速原型（硬编码优先，30 分钟可演示）
    - `debug-assist`：系统诊断（复现→隔离→假设→验证，禁止盲改代码）
    - `tech-writing`：Dream XI 风格文档（足球隐喻+中英对照+可运行示例）
    - `post-match-review`：结构化复盘模板，自动沉淀经验到情景记忆
  - **`tactic-loader.ts`**：战术加载引擎
    - `TacticRegistry`：战术注册表（register / search / getByCategory）
    - `detectTriggers()`：关键词得分匹配，自动识别需加载的战术
    - `PlayerTacticSlot`：球员战术槽
      - 位置合法性验证（门将不能加载前锋战术）
      - 冲突检测（`rapid-prototype` ↔ `tdd` 互斥）
      - `buildSystemPrompt()`：基础角色提示 + 所有战术提示拼接
      - `totalTokenOverhead`：已加载战术 Token 开销合计
  - **`index.ts`**：`createDefaultRegistry()` 预装 8 种内置战术的注册表工厂

---

## [0.7.0-alpha] - 2026-06-24

> 🧠 传球赛季（第二节）— 三层记忆管理器上线！

### Added

- **`packages/memory/`** — `@dream-xi/memory` 三层记忆管理包：
  - **`working-memory.ts`**：工作记忆管理器
    - Token 消耗追踪（支持中英文混合估算）
    - 85% 阈值自动触发压缩（保留最近 30% 条目）
    - 身份锚定卡注入（每 N 条消息注入一次，防上下文压缩失忆）
    - `buildContextMessages()`：构建含锚定卡的 LLM 请求消息列表
    - `messageToWorkingEntry()`：`Message` → `WorkingMemoryEntry` 转换工具
  - **`episodic-store.ts`**：情景记忆存储
    - `EpisodicBackend` 接口：可插拔后端设计（Redis / 内存）
    - `InMemoryEpisodicBackend`：内存后端（对应 `pnpm start --memory`）
    - `EpisodicMemoryStore.save()`：保存线程摘要、关键决策、经验沉淀
    - `EpisodicMemoryStore.query()`：重要性 × 时间衰减（半衰期 7 天）综合评分排序
    - TTL 过期：默认 30 天（内存）/ 90 天（Redis）
  - **`index.ts`**：`MemoryManager` 三层门面
    - `processMessage()`：自动追加工作记忆，压缩时自动归档情景记忆
    - `getContextMessages()`：返回含身份锚定的 LLM 上下文列表
    - `buildMemoryContext()`：将历史记忆格式化为提示词前缀
    - `createInMemoryManager()`：快速创建内存模式管理器
    - `createRedisManager()`：快速创建 Redis 生产模式管理器
    - `getStats()`：运行状态统计（活跃工作记忆数、Token 使用详情）

---

## [0.6.0-alpha] - 2026-06-24

> 🔀 传球赛季（第一节）— A2A 消息路由器上线！

### Added

- **`packages/router/`** — `@dream-xi/router` A2A 消息路由包：
  - **`mention-parser.ts`**：`@mention` 解析器
    - 支持英文 ID（`@leo` / `@andre` / `@flash` / `@wall`）
    - 支持中文别名（`@里奥` / `@安德` / `@弗拉什` / `@沃尔`）
    - 支持位置别名（`@队长` / `@中场` / `@前锋` / `@后卫`）
    - 返回去重的球员 ID 列表 + 清理后的纯文本
  - **`intent-inferrer.ts`**：意图推断器
    - 关键词权重评分：每名球员 4 组关键词 × 权重（1-4）
    - 置信度计算与阈值过滤（默认阈值 0.2）
    - 无明确意图时回退到 Leo (#10 队长)
    - 返回各球员得分（支持调试）
  - **`thread-manager.ts`**：线程管理器
    - 对应 `/new` / `/threads` / `/use <id>` / `/where` 斜杠指令
    - 完整生命周期：create / get / list / setActive / archive
    - 参与者追踪、消息计数自动递增
  - **`index.ts`**：`MessageRouter` 核心路由类
    - 三段路由逻辑：@mention → 意图推断 → 默认路由
    - 自动构建完整 `Message` 对象（含 `MessageRouting`）
    - 自动更新线程参与者和消息计数
    - `routeToNewThread()` 快捷方法（一步创建线程 + 路由）

---

## [0.5.0-alpha] - 2026-06-23

> 🔷 类型系统赛季 — 从骨架到有血有肉的 TypeScript 工程！

### Added

- **`tsconfig.json`**：根 TypeScript 严格模式配置，含路径别名 `@dream-xi/types`
- **`packages/types/`** — `@dream-xi/types` 核心类型包，5 个模块完整定义：
  - **`player.ts`**：球员类型体系
    - `PlayerId` / `PlayerNumber` / `PlayerPosition` / `PlayerStatus`
    - `PlayerCapability`（10 种能力标签）、`ModelProvider`（8 种提供商）
    - `PlayerDefinition`（静态定义）+ `PlayerState`（运行时状态）
    - `PLAYER_DEFINITIONS` 常量（4 名球员 + 门将，与 AGENTS.md 精确对应）
  - **`message.ts`**：A2A 消息类型体系
    - 6 种内容块：`TextBlock` / `CodeBlock` / `DiffBlock` / `ReviewBlock` / `HandoffBlock` / `ChecklistBlock`
    - `ReviewFinding`（P1/P2/P3 发现等级）
    - `MessageRouting`（@mention 显式路由 + 意图推断）
    - `Message` + `Thread`（线程/战术板）
  - **`memory.ts`**：三层记忆架构类型
    - `MemoryLayer`：working / episodic / semantic
    - `EpisodicMemoryEntry`（Redis 跨线程摘要）
    - `SemanticMemoryEntry`（持久化经验文档）
    - `IdentityAnchor`（身份锚定卡，防上下文压缩）
    - `MemoryConfig`（存储后端配置）
  - **`tactic.ts`**：战术（Skill）框架类型
    - 7 种战术分类、触发条件、冲突检测
    - `TacticDefinition`（含系统提示注入）、`TacticLoadState`
    - `BUILTIN_TACTIC_IDS` 常量（8 种内置战术）
  - **`config.ts`**：平台完整配置类型
    - `DreamXiConfig`（与 `.env.example` 40+ 环境变量一一对应）
    - `FairPlayConfig`（球队铁律四条约束的类型化配置）
    - `ConfigValidationResult`（含已配置/在替补席球员列表）

---

## [0.4.0-alpha] - 2026-06-22

> ⚙️ 工程骨架赛季 — 从纯文档到可启动的工程项目！

### Added

- **`package.json`**：根 Monorepo 配置，定义完整 `scripts`（`build`/`start`/`test`/`lint`/`gate`/`clean` 等），与文档中所有命令一一对应
- **`pnpm-workspace.yaml`**：pnpm workspace 定义，支持 `packages/*` 多包结构
- **`.gitignore`**：规范的忽略配置，覆盖 Node.js、TypeScript、IDE、OS 文件，以及 Dream XI 运行时数据（球队铁律：数据圣殿不进版本库、API Key 不提交）
- **`.env.example`**：完整环境变量模板（SETUP.md 中提及的 `cp .env.example .env`），涵盖：
  - 服务器 & 存储（PORT、NODE_ENV、REDIS_URL）
  - 四名球员 API Key（Claude、GPT、Gemini、opencode）
  - 替补球员（Kimi、GLM、MiniMax、自定义 OpenAI 兼容接口）
  - 飞书 / Telegram / GitHub 集成
  - MCP 配置、安全（JWT）、日志
- **`biome.json`**：Biome lint/format 配置，实现 CONTRIBUTING.md 中描述的"球衣规范"：TypeScript 严格、no-any 警告、const 优先、安全规则、测试文件独立配置
- **`.github/workflows/ci.yml`**：GitHub Actions CI 流水线，6 个 Job：
  - 🧹 Lint & Format（球衣规范检查）
  - 🔷 TypeScript 严格类型检查
  - 🧪 Tests（Node 20 + 22 矩阵）+ 覆盖率上传
  - 🏗️ Build 构建验证
  - 🔒 Security 依赖审计 + 密钥扫描
  - ✅ Quality Gate 汇总（全部通过才算进球）

---

## [0.3.0-alpha] - 2026-06-21

> 🏗️ 工程化赛季 — 让贡献更丝滑！

### Added

- **GitHub Issue 模板**（`.github/ISSUE_TEMPLATE/`）：
  - `bug_report.md` — 伤病报告：标准化 Bug 提交格式，含环境信息、复现步骤、期望行为
  - `feature_request.md` — 转会申请：功能请求模板，含验收标准和影响范围
  - `question.md` — 上场答疑：引导用户先查文档再提问
- **GitHub PR 模板**（`.github/PULL_REQUEST_TEMPLATE.md`）：入队审批清单，涵盖变更类型、影响范围、破坏性变更声明
- **`docs/GLOSSARY.md`** — 术语表：足球隐喻 ↔ 技术概念双向对照，涵盖 30+ 术语和球员编号对照表
- **`docs/ARCHITECTURE.md`** — 架构决策记录（ADR）：6 条关键架构决策，含背景、理由、放弃的替代方案

### Changed

- **`SUPPORT.md`**：新增 GLOSSARY 和 ARCHITECTURE 文档链接
- **`docs/TIPS.md`**：新增 GLOSSARY 和 ARCHITECTURE 参考指引

---

## [0.2.0-alpha] - 2026-06-19

> 📚 文档增强赛季 — 更完善的战术手册！

### Added

- **FAQ 常见问题（README 中英双语）**：新增面向新用户的常见问题解答区块，涵盖模型选择、Redis 要求、多用户支持等
- **架构说明优化**：补充架构三层原则的"负责/不负责"对比说明，使设计意图更清晰
- **ROADMAP v0.2.0 里程碑**：新增下一赛季详细里程碑计划，包括战术训练场可视化编辑器等
- **TIPS 工作效率提升**：补充高级使用技巧，包括 Antigravity AI 集成建议
- **AGENTS.md 完善**：补充 #1 门将（Quality Gate）的详细职责描述，以及 Antigravity AI 助手角色定位
- **design-system.md 补充**：新增阴影/高程系统规范和语义色值说明

### Changed

- **ROADMAP 进度更新**：将"本地全感知（Qwen）"从规划中更新为进行中，反映最新开发状态
- **双语文档同步**：中英文 README 同步补充 FAQ 区块和架构说明

---

## [0.1.0] - 2026-06-18

> 🏆 首个公开版本 — 球队集结完毕！

### Added

- **完整项目文档结构**：README（中英双语）、CONTRIBUTING、SECURITY、SUPPORT、SETUP、AGENTS、CHANGELOG
- **球员阵容定义**：
  - #10 队长 Leo（Claude）— 组织核心
  - #8 中场 André（GPT/Codex）— 引擎
  - #9 前锋 Flash（Gemini）— 灵感射手
  - #4 后卫 Wall（opencode）— 稳固磐石
- **球队铁律 (Fair Play Rules)**：四条不可违反的安全约定
- **主教练模式 (Head Coach Mode)**：人类作为战术决策者的角色定义
- **五大原则**：面向终场哨声、共创者非木偶、方向大于速度、唯一真相源、验证即完成
- **架构文档**：三层架构（模型层 / Agent CLI 层 / 平台层）
- **docs/ 文档目录**：
  - `docs/VISION.md` — 愿景：我们不缺球星，缺的是一支真正的球队
  - `docs/TIPS.md` — 赛场锦囊
  - `docs/ROADMAP.md` — 赛季计划
  - `docs/SOP.md` — 战术纪律手册
  - `docs/design-system.md` — 球队视觉识别系统
- **XI & You** 品牌理念：梦之队与你，一起征战，一起夺冠

[0.1.0]: https://github.com/loulanyue/dream-xi-ai/releases/tag/v0.1.0

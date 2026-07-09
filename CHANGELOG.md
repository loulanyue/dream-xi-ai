# Changelog

变更记录遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## 版本策略

- `PATCH`：不破坏兼容性的 Bug 修复、文档更新
- `MINOR`：向后兼容的新功能、新球员接入
- `MAJOR`：破坏性变更，需要用户迁移

---

## [3.3.0-alpha] - 2026-07-10

> 🔗 生命周期钩子赛季 — `@dream-xi/hook` · 串行/并行策略 · 优先级排序 · 一次性钩子

### Added

- **`packages/hook/`**：Agent 生命周期钩子系统（新建包，零外部运行时依赖）
  - **`HookSystem<TMap>`**：泛型钩子管理核心类，`TMap` 定义钩子名 → 载荷类型映射。
    - `on(name, handler, priority?)`：注册持久钩子，返回注销函数（unsubscribe）。
    - `once(name, handler, priority?)`：注册一次性钩子，触发后自动移除。
    - `off(name, handler)`：精确移除某个处理函数。
    - `emit(name, payload, strategy?)`：触发钩子，返回 `HookEmitResult`（调用数、耗时、错误列表）。
    - `count(name)` / `hookNames()`：运行时查询已注册钩子信息。
  - **`AgentLifecycle`**：内置 Dream XI 球员标准生命周期类型：`onCreate` / `onReady` / `onMessage` / `onReply` / `onError` / `onDestroy`。
  - **串行 / 并行策略**：全局默认 `serial`（按优先级依次执行），`emit` 时可临时切换为 `parallel`（Promise.allSettled，部分失败不影响其他钩子）。
  - **优先级排序**：priority 数字越小越先执行，支持精细化控制钩子调用顺序。

---

## [3.2.0-alpha] - 2026-07-09

> 🛠 函数调用赛季 — `@dream-xi/tool` · 工具注册中心 · JSON Schema 参数定义 · 调用历史

### Added

- **`packages/tool/`**：Agent 工具注册与调用框架（新建包，零外部运行时依赖）
  - **`ToolRegistry`**：工具注册中心核心类
    - `register(tool)`：注册带 JSON Schema 参数描述的工具，重复注册抛出错误。
    - `unregister(name)`：按名称注销已注册工具。
    - `call(name, input)`：类型安全的工具调用，自动记录耗时与 `calledAt` 时间戳。
    - `toSchemas()`：导出所有工具 Schema（供 LLM function calling 构建参数列表）。
    - `schemasByTag(tag)`：按标签筛选工具 Schema，便于按能力域分组展示。
    - `getHistory(limit?)`：获取最近 N 条调用历史（默认 50）。
    - `clearHistory()`：清空调用历史记录。
  - **`ToolDefinition<TInput, TOutput>`**：泛型工具定义接口，包含名称、描述、JSON Schema 参数和处理函数。
  - **`ToolCallResult<TOutput>`**：调用结果封装：输入、输出、耗时、成功标志、错误信息。
  - **`ToolParameterSchema`**：兼容 OpenAI/Anthropic function calling 格式的 JSON Schema 类型系统。

---

## [3.1.0-alpha] - 2026-07-07

> 🔀 流水线执行赛季 — `@dream-xi/pipeline` · 顺序步骤 · 并行步骤 · 条件守卫

### Added

- **`packages/pipeline/`**：Agent 工作流执行管道（新建包，零外部运行时依赖）
  - **`Pipeline<T>`**：顺序步骤链式执行引擎，每步输出作为下步输入的上下文。
    - `run(initialContext)`：从初始值开始执行所有步骤，返回完整的 `PipelineResult`（含耗时、每步状态）。
    - `pipe(step)`：不可变地追加步骤，返回新 Pipeline 实例（链式组合友好）。
    - `when` 守卫：每步支持可选条件函数，返回 false 时跳过该步骤（context 直接透传）。
  - **`parallelStep(name, steps)`**：将多个步骤包装为并发执行的单一步骤，部分失败不影响其他步骤。
  - **`conditionalStep(name, when, run)`**：条件步骤语法糖，无需手动构建步骤对象。
  - **`PipelineResult<T>`**：执行摘要包含总耗时、各步记录、最终输出和整体成功标志。

---

## [3.0.0-alpha] - 2026-07-08

> 🔧 严格类型合规赛季 — 全量 TypeScript 严格模式适配 · 25 个包零错误构建 · 编译链条全面打通

### Fixed

- **全局 `tsconfig.json`**：移除了 `baseUrl` / `paths` 映射配置（该配置导致 `fair-play`、`event-bus` 等依赖 `@dream-xi/types` 源文件的包出现 `rootDir` 越界报错）。
- **`packages/retry/`**：
  - `RetryExhaustedError.cause` 字段添加 `override` 修饰符（TS4114）。
  - HTTP status 访问方式改为 `{ status?: unknown; statusCode?: unknown }` 内联类型转换，修复 `noPropertyAccessFromIndexSignature` 报错。
- **`packages/validator/`**：
  - 修复 `_patternMsg` 类型签名（`exactOptionalPropertyTypes` 兼容）。
  - 修复 5 处 `??` 与 `||` 混用的运算符优先级错误（TS5076）。
- **`packages/fair-play/`**：
  - 清空 `tsconfig.json` 中的 `paths` 字段，避免 rootDir 越界。
  - 修复 `action-checker.ts` `return` 对象中 `rejectionMessage` 的可选属性赋值。
- **`packages/config/`**：
  - 从 `./validator.ts` 改为从 `@dream-xi/types` 直接导入 `ConfigValidationResult`。
  - 修复 `buildMemoryConfig` / `buildPlayerConfigs` / `buildLogConfig` 中 `redisUrl`、`baseUrl`、`file` 等可选字段的 `exactOptionalPropertyTypes` 报错。
- **`packages/event-bus/`**：
  - 修复 `factory.ts` 中 3 处含 `source?` 可选参数的工厂方法返回对象赋值。
  - 修复 `index.ts` `snapshot()` 方法中 `source` 的可选属性展开赋值。
  - 修复 `process.env["NODE_ENV"]` 的 `noPropertyAccessFromIndexSignature` 报错，添加 `biome-ignore` 注释。
- **`packages/router/`**：
  - 修复 `MessageRouting` 中 `inferredTarget` 的可选属性展开写法。
  - 修复 `routeToNewThread` 中 `CreateThreadOptions.title` 的可选属性展开写法。
- **`packages/memory/`**：
  - 修复 `maybeCompressWorkingMemory` 返回对象中 `episodicMemoryId` 的可选属性展开。
  - 修复 `createRedisManager` 中 `episodicBackend` 的可选属性展开。
  - 修复 `messageToWorkingEntry` 中 `playerId` 的可选属性展开（`working-memory.ts`）。
- **`packages/server/`**：
  - 修复 `routes/tactics.ts` 中 `TacticSummary.preferredPlayer` 的可选属性展开。
  - 修复 `routes/threads.ts` 中线程创建时 `title` / `tags` 的可选属性展开。
  - 修复 `main.ts` 中 `process.env["REDIS_URL"]` 等的 `noPropertyAccessFromIndexSignature` 报错。

---

## [2.9.0-alpha] - 2026-07-06

> 📊 指标遥测赛季 — `@dream-xi/telemetry` · 指标收集 · Span 耗时测量 · 数据归纳

### Added

- **`packages/telemetry/`**：运行时指标遥测工具库（新建包，零外部依赖）
  - **`TelemetryTracker`**：收集与记录性能/资源指标的核心管理类。
    - `startSpan(name, tags)`：开启耗时 Span，返回完成测量并自动记录指标的回调。
    - `record(name, value, tags)`：记录任意维度的数据记录（如 Token 用量、缓存命中等）。
    - `summary(name)`：提供归总数据计算，输出总和、均值、最大值和次数。
    - `getAllMetrics()` / `reset()`：管理指标状态。
  - **`telemetry`**：预置的全局单例，支持无状态导入。

---

## [2.8.0-alpha] - 2026-07-06

> ⏱ 频次限制赛季 — `@dream-xi/throttle` · 节流限制 · 防抖延迟 · 边界触发

### Added

- **`packages/throttle/`**：函数节流与防抖频次控制工具库（新建包，零外部依赖）
  - **`throttle(fn, wait, options)`**：限制高频函数调用在指定周期内最多触发一次，支持 `leading` 和 `trailing` 选项配置。
  - **`debounce(fn, wait, options)`**：当函数停止触发一定延迟后才执行回调，支持 `immediate` 立即调用。

---

## [2.7.0-alpha] - 2026-07-06

> ⚙️ 工作流状态赛季 — `@dream-xi/state` · 有限状态机 · 转换守卫 · 回调钩子

### Added

- **`packages/state/`**：有限状态机 (FSM) 实现（新建包，零外部依赖）
  - **`StateMachine`**：类型安全的状态机核心类，支持细粒度控制状态迁移。
    - `transition(event)`：执行状态转移，支持批量源状态匹配。
    - `can(event)`：判断当前状态下能否执行指定的事件转换。
    - `onBeforeTransition`：转换前守卫拦截回调，支持异步布尔返回以控制是否准许切换。
    - `onTransition`：转换完成后的通知回调。

---

## [2.6.0-alpha] - 2026-07-06

> 📂 结构化解析赛季 — `@dream-xi/parser` · 代码块提取 · Markdown 章节分割 · 键值解析

### Added

- **`packages/parser/`**：大模型结构化回复解析器（新建包，零外部运行时依赖）
  - **`parseJsonBlock`**：提取 Markdown 围栏（fences）内的 JSON 文本，内置防错和回退查找机制，容错率高。
  - **`parseMarkdownSections`**：根据大纲标题（如 `#` / `##` / `###`）对回复进行段落与章节提取。
  - **`parseKeyValueLines`**：轻量行解析器，自动剥离空行、注释（如 `#` / `//`），快速提取 `key: value` 模式。

---

## [2.5.0-alpha] - 2026-07-06

> 📝 提示词模板赛季 — `@dream-xi/prompt` · 变量插值 · 格式验证 · 结构化组装

### Added

- **`packages/prompt/`**：提示词模板引擎实现（新建包，零外部依赖）
  - **`PromptTemplate`**：用于动态解析并生成提示词内容。
    - 自动发现变量：支持 `{{variable}}` 语法模式匹配。
    - `render(params)`：变量替换与全量匹配完整度校验。
  - **`SystemPromptBuilder`**：用于流畅链式构造系统级的 Prompt 文本。
    - `addSection(title, content)`：支持子标题和段落拼接。
    - `addRule(rule)`：支持有序排列的硬性边界规则限制。
    - `build()`：全段合并导出。

---

## [2.4.0-alpha] - 2026-07-06

> 🤖 智能体基础赛季 — `@dream-xi/agent` · 身份标识管理 · 状态跟踪 · 思考循环 · 全局总线联动

### Added

- **`packages/agent/`**：基础 Agent 模型实现（新建包，依赖 context 与 pubsub）
  - **`Agent`**：核心抽象基类，用于承载 Agent 的主要生命周期。
    - `name` / `role` / `context`（ContextWindow 实例）属性绑定。
    - `think(prompt, llmCall)`：思考与决策执行循环。触发开始、成功或失败事件派发。
    - `reset()`：恢复/重置上下文状态至 idle。
    - `state` getter：跟踪 `idle` / `thinking` / `executing` / `error` 智能体状态。

---

## [2.3.0-alpha] - 2026-07-06

> 🔌 协议集成赛季 — `@dream-xi/mcp-client` · Model Context Protocol · 工具枚举 · 工具调用 · stdio 传输

### Added

- **`packages/mcp-client/`**：Model Context Protocol (MCP) 客户端实现（新建包，零外部运行时依赖）
  - **`McpClient`**：用于与外部 MCP 服务端建立 stdio (标准输入输出) 交互通道。
    - `connect()`：启动外部进程（如 npx 启动的 server）并进行标准协议握手初始化。
    - `listTools()`：列出服务端提供的所有可用工具 (McpTool)。
    - `callTool(name, args)`：通过 JSON-RPC 2.0 格式异步调用具体的工具。
    - `request(method, params)` / `disconnect()`：基础请求传输与连接关闭管理。
  - **JSON-RPC 2.0 消息处理**：
    - 支持基于行分割的 JSON 数据协议解析与异步状态回调管理。

---

## [2.2.0-alpha] - 2026-07-06

> 🛠 基础工具赛季 — `@dream-xi/utils` · 深度合并 · 健值提取与剔除 · 自增随机 ID · 异步等待

### Added

- **`packages/utils/`**：通用辅助工具库（新建包，零运行时依赖）
  - **对象操作工具**：
    - `isObject(val)`：检查值是否为普通非数组对象。
    - `deepMerge(target, ...sources)`：深度递归合并多个对象，解决 TypeScript exactOptionalPropertyTypes 兼容。
    - `pick(obj, keys)` / `omit(obj, keys)`：安全地从对象中提取或剔除某些字段。
  - **唯一标识工具**：
    - `uuid()`：符合 RFC4122 v4 的轻量随机 UUID 生成器。
    - `nextId(prefix?)`：进程内自增、高可读性的时间戳 ID 生成器。
  - **流程控制工具**：
    - `delay(ms, signal?)`：异步延时等待函数，支持 AbortSignal 取消。

---

## [2.1.0-alpha] - 2026-07-06

> 🧠 上下文赛季 — `@dream-xi/context` · 对话窗口管理 · Token 预算估算 · 消息压缩截断 · 上下文快照

### Added

- **`packages/context/`**：LLM 对话上下文管理器（新建包，零运行时依赖）
  - **`ContextWindow`**：Agent 对话上下文管理类，支持最大 Token/最大消息条数限制
    - `addUser(content, metadata?)` / `addAssistant(content, metadata?)` / `addTool(content, metadata?)` / `addMessage(role, content, metadata?)`：添加各种角色的消息，自动跟踪预估 Token。
    - `overBudget`：判断是否超出 Token 限制，提供布尔值状态。
    - `compress()`：异步压缩上下文，调用配置的消息压缩器。
    - `toMessages()` / `toFullMessages()`：导出兼容主流 LLM 的消息结构。
    - `snapshot()` / `restore(snap)`：创建或恢复上下文快照，方便多路径生成回滚。
    - `stats()`：获取当前消息条数、token 使用率、最大限制等数据统计。
  - **消息压缩策略**：
    - `TruncateCompressor`：从最旧的非 system 消息开始截断以腾出 Token。
    - `HeadTailCompressor`：保留头部 K 条（如最初任务）和尾部 K 条，中间部分使用占位符省略。
  - **Token 估算器**：
    - 针对 CJK 中日韩和英文混合内容进行了优化的内置估算算法。
  - **预设配置**：
    - `createTacticAnalystContext()`：战术分析师预设上下文（24k Token，30 条限制，保留首尾）。
    - `createManagerContext()`：球队管理员预设上下文（8k Token，20 条限制，直接截断）。

---

## [2.0.0-alpha] - 2026-07-05

> 📡 通信赛季 — `@dream-xi/pubsub` · 通配符 Pub/Sub · 类型安全 · 异步派发 · Retain 消息

### Added

- **`packages/pubsub/`**：进程内发布/订阅消息总线（新建包，零外部依赖）
  - **`PubSub<TMap>`**：泛型类型安全消息总线类
    - `subscribe(pattern, callback, options?)`：订阅 topic，返回 `Unsubscribe` 函数
      - 支持通配符：`match.*`（匹配单段）/ `**`（匹配任意多段）
      - `filter?: (payload) => boolean`：订阅级别过滤谓词
      - `once?: true`：一次性监听，收到第一条消息后自动取消
      - `receiveRetained?: false`：是否立即接收历史 retain 消息
    - `once(pattern, callback, options?)`：一次性监听快捷方式
    - `publish(topic, payload, retain?)`：**异步**派发，`Promise.allSettled` 并行调用所有匹配订阅者
    - `publishSync(topic, payload, retain?)`：**同步**串行派发，适合测试
    - `clearSubscriptions()` / `clearRetained(topic)` / `clearAllRetained()`
    - `subscriberCount` / `retainedCount` getter
  - **通配符路由**：`*` → 单段（`[^.]+`）；`**` → 多段（`.+`），编译为 RegExp
  - **错误隔离**：`catchErrors: true`（默认），单个订阅者异常不影响其他订阅者
  - **`onError` 回调**：异常统一上报
  - **`createPubSub<TMap>(options?)`**：工厂函数
  - **`dreamXiBus`**：全局单例，绑定 `DreamXiTopics` 类型映射
    - 覆盖 12 类核心事件：match / player / tactic / llm / system

### Architecture

```
@dream-xi/pubsub (no deps)   ← 松耦合通信层
       ↑            ↑
@dream-xi/server   @dream-xi/health  ← 各模块通过 dreamXiBus 解耦通信
```

---

## [1.9.1-alpha] - 2026-07-02

> 📋 可靠性赛季 — `@dream-xi/queue` · 并发控制 · 优先级调度 · 延迟执行 · 任务重试

### Added

- **`packages/queue/`**：进程内任务队列（新建包，零外部依赖）
  - **`TaskQueue<T>`**：泛型任务队列类
    - `add(fn, options?)`：加入队列，返回 `Promise<TaskResult<T>>`
    - `priority`（数字越大越先执行）+ `delayMs`（延迟多少毫秒后才允许取出）
    - `maxRetries` + `baseRetryDelayMs`：独立重试配置，指数退避（delay = base × 2^attempt）
    - `signal: AbortSignal`：任务在排队/等待/重试期间均可取消
    - `pause() / resume()`：暂停/恢复调度（不影响已在执行的任务）
    - `clear()`：清空等待队列，所有未执行任务 reject
    - `stats()`：`{ pending, running, totalCompleted, totalFailed, totalCancelled }`
    - `idle` getter：队列空且无运行任务时为 true
  - **`QueueCallbacks<T>`**：`onStart / onSuccess / onFail / onDrain` 全链路回调
  - **`TaskResult<T>`**：`{ value, durationMs, attempts }` 成功结果
  - **`createQueue<T>(options?)`**：工厂函数
  - **预设队列**：
    - `llmQueue`：并发 3，默认重试 2 次，内置失败日志，适合 LLM API 批量调用
    - `analysisQueue`：并发 1 串行，适合报告生成等后台独占任务

### Architecture

```
@dream-xi/queue (no deps)   ← 任务调度层
       ↑
@dream-xi/server             ← 将 LLM 调用 dispatch 到 llmQueue
```

---

## [1.9.0-alpha] - 2026-07-03

> 🏥 可靠性赛季 — `@dream-xi/health` · Liveness · Readiness · Startup Probe · K8s 标准

### Added

- **`packages/health/`**：深度健康检查系统（新建包，零外部依赖）
  - **`HealthRegistry`**：检查器注册中心
    - `register(config)`：注册自定义检查器（支持多探针绑定）
    - `registerMemoryCheck(options?)`：内置 Node.js heap 内存检查（阈值可配）
    - `registerStartupCheck(options?)`：内置启动就绪检查（最短运行时间可配）
    - `runLiveness()` → K8s liveness probe（失败触发容器重启）
    - `runReadiness()` → K8s readiness probe（失败从负载均衡摘除）
    - `runStartup()` → K8s startup probe（初始化期间保护 liveness）
  - **检查器重要级别**（`criticality`）：
    - `"critical"` → 失败整体 `unhealthy`（HTTP 503）
    - `"degraded"` → 失败整体 `degraded`（HTTP 200 + 告警）
    - `"optional"` → 失败仅记录，不影响状态
  - **并行执行 + 独立超时**：所有检查器并发运行，每个最多等待 `timeoutMs`（默认 5s）
  - **`HealthReport`**：结构化 JSON 报告，含 `status`、`checks[]`、`uptimeSeconds`、`memory` 快照
  - **`createHealthHandlers(registry)`**：HTTP 路由适配器
    - `handleLive` / `handleReady` / `handleStartup` → 直接挂载到 Node.js HTTP 服务器
    - 状态码映射：`unhealthy` → 503，其他 → 200
  - **`createDreamXiRegistry(options)`**：Dream XI 预配置工厂（内存检查 + 启动检查开箱即用）

### Architecture

```
@dream-xi/health (no deps)
       ↑
@dream-xi/server  ←  GET /health/live  /health/ready  /health/startup
```

---

## [1.8.1-alpha] - 2026-07-01

> 🔧 工程化赛季 — `check-packages` 健康检查 · 新包接入指南 · 根脚本补全

### Added

- **`scripts/check-packages.mjs`**：包健康检查工具（新增脚本）
  - 扫描 `packages/*` 所有包，逐一验证：必填字段（name/version/description/license）、semver 格式、`workspace:*` 内部依赖协议、`tsconfig.json` 存在、`src/index.ts` 存在、`Apache-2.0` 协议
  - 彩色输出：✓ 通过 / ⚠ 警告 / ✗ 错误
  - 汇总报告 + 非零退出码（CI 友好）
  - `--fix` 模式预留（未来自动修复）

### Changed

- **`package.json`**（root）：版本 `1.3.0-alpha` → `1.8.0-alpha`
  - 新增 `check:packages` 脚本：`node scripts/check-packages.mjs`
  - 新增 `pkg:new` 脚本（未来新包自动脚手架）
- **`CONTRIBUTING.md`**：新增"新增包指南（上场新球员）"章节
  - 完整 5 步流程：目录创建 → package.json → tsconfig.json → src/index.ts → `pnpm check:packages`
  - 明确 `workspace:*` 协议要求
  - 资源链接补充 `docs/DEVELOPMENT.md`

---

## [1.8.0-alpha] - 2026-07-01

> 💾 可靠性赛季 — `@dream-xi/cache` · LRU 淘汰 · TTL 过期 · `getOrSet` 原子操作

### Added

- **`packages/cache/`**：内存缓存包（新建包，零外部依赖）
  - **`Cache<V>`**：泛型类型安全缓存类
    - `get(key)`：读取，过期自动删除并返回 `undefined`
    - `set(key, value, ttlMs?)`：写入，支持独立 TTL
    - `getOrSet(key, loader, ttlMs?)`：SWR 风格原子操作，防止缓存穿透
    - `has(key)`：存在检查（不更新 LRU 顺序）
    - `delete(key)` / `clear()` / `keys()`
    - `stats()`：命中率、miss 次数、LRU/TTL 淘汰统计
  - **LRU 淘汰**：容量满时自动移除最久未访问的 key
  - **TTL 过期**：每个 key 可设独立 TTL，定时清理 + 惰性过期双重机制
  - **事件回调**：`onEvict`（LRU 淘汰）/ `onExpire`（TTL 过期）/ `onSet` / `onGet`
  - **`createCache<V>(options?)`**：工厂函数
  - **预设实例**：`tacticCache`（200条/10min）、`playerCache`（50条/30min）、`llmResponseCache`（1000条/5min）

---

## [1.7.0-alpha] - 2026-07-01

> 🚦 可靠性赛季 — `@dream-xi/rate-limiter` · 令牌桶 · 滑动窗口 · HTTP 标准头

### Added

- **`packages/rate-limiter/`**：API 速率限制器（新建包，零外部依赖）
  - **`TokenBucketLimiter`**：令牌桶算法
    - `tokensPerSecond`：每秒补充令牌数；`bucketSize`：最大突发容量
    - `consume(key, cost?)`：消耗令牌，返回 `RateLimitResult`
    - 自动按时间补充令牌，支持短时突发（适合 LLM 调用）
  - **`SlidingWindowLimiter`**：滑动窗口算法
    - `windowMs`：时间窗口大小；`maxRequests`：窗口内最大请求数
    - `check(key)`：精确计数，移除窗口外时间戳
    - 适合 REST API 端点频率控制
  - **`toRateLimitHeaders(result)`**：生成标准 `RateLimit-*` + `Retry-After` HTTP 响应头
  - **自动清理**：定时回收超时不活跃 key，防止内存泄漏
  - **预设限制器**：`chatRateLimiter`（60s/20次）、`llmTokenBucket`（1 rps/突发 3）、`healthRateLimiter`（60s/60次）

---

## [1.6.0-alpha] - 2026-06-30

> 🔄 可靠性赛季 — `@dream-xi/retry` · 指数退避 · Full Jitter · 断路器 · 零依赖

### Added

- **`packages/retry/`**：生产级重试工具包（新建包，零外部依赖）
  - `packages/retry/src/index.ts`：完整重试 + 断路器实现
    - **`withRetry(fn, options)`**：核心重试函数
      - `maxAttempts`：最大尝试次数（含首次，默认 3）
      - `baseDelayMs` / `maxDelayMs`：基础/最大等待时间
      - `strategy`：退避策略（`"exponential"` | `"linear"` | `"fixed"`）
      - `factor`：指数退避倍数（默认 2）
      - `jitter: true`：Full Jitter 随机化，彻底消除惊群效应
      - `isRetryable(err)`：自定义可重试判断，返回 false 立即抛出
      - `onRetry / onSuccess / onExhausted`：完整生命周期回调
      - `signal: AbortSignal`：外部取消支持，等待期间可中断
      - `timeoutMs`：单次操作超时，超时自动触发重试
    - **`RetryExhaustedError`**：全部次数耗尽后抛出（含 `cause`、`attempts`、`elapsedMs`）
    - **`RetryCancelledError`**：AbortSignal 触发取消时抛出
    - **`RetryTimeoutError`**：单次操作超时时抛出（可重试错误）
    - **`isRetryable(error)`**：智能错误分类
      - HTTP 状态码：408 / 429 / 500 / 502 / 503 / 504 可重试
      - Node.js errno：`ECONNRESET` / `ECONNREFUSED` / `ETIMEDOUT` 等可重试
      - 消息关键词兜底：timeout / rate limit / service unavailable 等
    - **`CircuitBreaker`**：断路器
      - 三态：`closed`（正常）→ `open`（熔断）→ `half-open`（探测恢复）
      - `failureThreshold`：连续失败多少次后熔断（默认 5）
      - `recoveryTimeMs`：熔断恢复等待时间（默认 60s）
      - `successThreshold`：半开状态连续成功多少次后关闭（默认 2）
      - `onStateChange`：状态变更回调（用于告警/监控）
      - `breaker.execute(fn)`：执行操作，断路器打开时直接拒绝
      - `breaker.reset()`：手动重置为关闭状态
    - **预设配置**：
      - `LLM_RETRY_OPTIONS`：LLM API 调用（4 次 / 1s 起始 / 20s 上限 / 60s 超时）
      - `INFRA_RETRY_OPTIONS`：内部基础设施调用（3 次 / 200ms 起始 / 5s 上限）
      - `LLM_CIRCUIT_BREAKER_OPTIONS`：LLM 断路器（5 次失败熔断 / 30s 恢复）

### Architecture

```
@dream-xi/retry (no deps)   ← 可靠性层，零依赖
       ↑
@dream-xi/server             ← LLM 调用时使用 withRetry + CircuitBreaker
```

---

## [1.4.8-alpha] - 2026-06-28

> 🛡️ 基础设施赛季 — `@dream-xi/validator` · Schema 驱动校验 · 类型推断 · 内置 API Schema

### Added

- **`packages/validator/`**：轻量级请求验证包（新建包，零外部依赖）
  - `packages/validator/src/index.ts`：完整校验器实现
    - **`StringSchema`**：字符串校验
      - `.minLength(n)` / `.maxLength(n)`：长度范围限制
      - `.pattern(re, msg?)`：正则匹配校验
      - `.oneOf(values)`：枚举值限制
      - `.trim()`：自动去除首尾空白
    - **`NumberSchema`**：数字校验
      - `.min(n)` / `.max(n)`：数值范围限制
      - `.integer()`：限制为整数
    - **`BooleanSchema`**：布尔值校验
    - **`ArraySchema<T>`**：数组校验
      - `.minItems(n)` / `.maxItems(n)`：元素数量限制
      - 递归校验每个数组元素（支持嵌套 Schema）
    - **`ObjectSchema<S>`**：对象校验
      - 按 Shape 声明逐字段校验
      - `.allowUnknownFields()`：可选允许额外字段
      - 递归支持嵌套对象
    - **所有 Schema** 共有：`.optional()`（可选字段）、`.label(name)`（错误消息字段名）
    - **`v` 构建器**：`v.string()` / `v.number()` / `v.boolean()` / `v.array()` / `v.object()` 流式 API
    - **`validate(schema, value)`**：顶层校验函数，返回 `ValidationResult<T>`（discriminated union）
    - **`ValidationError`**：`{ path, message, received }` 精确字段错误定位
    - **类型推断**：`ObjectSchema<S>` 自动推断 `InferShape<S>` TypeScript 类型
    - **内置平台 Schema**：
      - `ChatRequestSchema`：`POST /api/chat` 请求体（含嵌套 `options`）
      - `CreateThreadSchema`：`POST /api/threads` 请求体
      - `WriteMemorySchema`：`POST /api/memory` 写入请求体
      - `SearchMemorySchema`：`GET /api/memory/search` 查询参数
    - **`formatValidationErrors(errors)`**：将错误列表格式化为 HTTP 响应 `details` 字段

### Architecture

```
@dream-xi/validator (no deps) ← 校验层，与类型系统解耦
       ↑
@dream-xi/server               ← API 路由中直接调用 validate()
```

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

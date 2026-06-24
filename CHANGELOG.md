# Changelog

变更记录遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## 版本策略

- `PATCH`：不破坏兼容性的 Bug 修复、文档更新
- `MINOR`：向后兼容的新功能、新球员接入
- `MAJOR`：破坏性变更，需要用户迁移

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

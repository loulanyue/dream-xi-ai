/**
 * @dream-xi/tactic — 内置战术注册表（Built-in Tactics Registry）
 *
 * 定义 8 种内置战术的完整配置，包括触发关键词、
 * 系统提示注入内容、适用球员和冲突关系。
 *
 * 参考：docs/TIPS.md § 战术加载
 * 参考：docs/GLOSSARY.md — 战术手册 (Playbook)
 */

import type { TacticDefinition } from "@dream-xi/types";
import { BUILTIN_TACTIC_IDS } from "@dream-xi/types";

const NOW = new Date("2026-06-25T00:00:00Z");

/** 内置战术完整定义列表 */
export const BUILTIN_TACTICS: TacticDefinition[] = [
  // ─── TDD — 测试驱动开发 ─────────────────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.TDD,
    name: "TDD（测试驱动开发）",
    description: "先写测试，再写实现。确保每个功能有完整的测试覆盖。",
    version: "1.0.0",
    category: "development",
    applicablePositions: ["captain", "midfielder", "defender"],
    preferredPlayer: "andre",
    trigger: {
      keywords: ["tdd", "测试驱动", "先写测试", "test first", "单元测试", "测试覆盖"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：TDD（测试驱动开发）

你正在使用 TDD 战术。严格遵循红-绿-重构循环：

1. **红（Red）**：先写一个会失败的测试，明确验收条件
2. **绿（Green）**：写最少的代码让测试通过，不要过度设计
3. **重构（Refactor）**：在测试全绿的保护下清理代码

**执行规范：**
- 每个功能点对应至少一个测试用例
- 测试命名格式：\`描述_条件_期望结果\`
- 优先测试边界条件和异常路径
- 覆盖率目标：核心逻辑 > 80%

**禁止：** 在测试通过前提交代码。`,
    conflicts: [],
    estimatedTokenOverhead: 180,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─── Code Review — 代码审查 ─────────────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.CODE_REVIEW,
    name: "跨位置代码审查",
    description: "系统性代码审查：安全、性能、可维护性、设计原则全面评估。",
    version: "1.0.0",
    category: "review",
    applicablePositions: ["midfielder", "captain"],
    preferredPlayer: "andre",
    trigger: {
      keywords: ["审查", "review", "code review", "check", "检查代码", "看一下"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：跨位置代码审查

你正在进行代码审查。按以下维度系统评估，每条发现必须标注严重等级：

**P1（红牌）— 阻断合并，必须修复：**
- 安全漏洞（注入、越权、硬编码密钥）
- 数据丢失风险
- 违反球队铁律（Fair Play Rules）

**P2（黄牌）— 应该修复：**
- 逻辑错误或边界未处理
- 性能问题（N+1、无索引查询）
- 缺少错误处理

**P3（角球）— 建议改进：**
- 命名不清晰
- 可以提取的重复代码
- 注释缺失

**输出格式：**
\`\`\`
[P1] 文件:行号 — 问题描述
     建议：具体修复方案
\`\`\``,
    conflicts: [],
    estimatedTokenOverhead: 250,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─── Security Review — 安全审查 ─────────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.SECURITY_REVIEW,
    name: "安全审查",
    description: "专项安全扫描：OWASP Top 10、依赖漏洞、配置安全。",
    version: "1.0.0",
    category: "review",
    applicablePositions: ["midfielder"],
    preferredPlayer: "andre",
    trigger: {
      keywords: ["安全", "security", "漏洞", "vulnerability", "owasp", "渗透", "注入"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：安全审查

专注安全漏洞扫描，重点检查：

**OWASP Top 10：**
- A01 访问控制失效：未授权访问、权限绕过
- A02 加密失败：明文传输、弱加密算法、硬编码密钥
- A03 注入：SQL/NoSQL/命令注入、XSS
- A04 不安全设计：业务逻辑缺陷
- A05 安全配置错误：默认密码、暴露的调试端点

**Dream XI 特别检查：**
- 是否有代码可能违反球队铁律（删数据库、杀进程）
- API Key 是否可能被记录到日志或错误信息中
- 端口边界是否被跨越访问

所有发现默认为 P1，除非明确可降级。`,
    conflicts: [BUILTIN_TACTIC_IDS.CODE_REVIEW],
    estimatedTokenOverhead: 220,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─── Architecture Design — 架构设计 ────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.ARCHITECTURE_DESIGN,
    name: "架构设计",
    description: "系统架构规划：模块划分、接口设计、技术选型、可扩展性评估。",
    version: "1.0.0",
    category: "design",
    applicablePositions: ["captain"],
    preferredPlayer: "leo",
    trigger: {
      keywords: ["架构", "architecture", "设计方案", "技术选型", "系统设计", "模块划分"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：架构设计

你正在进行架构设计。遵循 Dream XI 三层原则（参考 ARCHITECTURE.md ADR-001）：

**设计流程：**
1. **理解边界**：确认输入、输出、约束条件
2. **识别核心域**：找出最重要的业务概念和不变量
3. **设计接口**：先定义 TypeScript 类型，再考虑实现
4. **评估权衡**：每个设计决策都要说明取舍（参考 ADR 格式）

**输出格式：**
- 架构图（ASCII）
- 核心类型定义（TypeScript）
- 关键 ADR（背景 + 决定 + 放弃的方案）

**原则：** 方向 > 速度（P3：不确定时停下来问，而非猜测）`,
    conflicts: [],
    estimatedTokenOverhead: 200,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─── Rapid Prototype — 快速原型 ─────────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.RAPID_PROTOTYPE,
    name: "快速原型",
    description: "最快速度出可演示的原型，验证想法，不追求代码质量。",
    version: "1.0.0",
    category: "design",
    applicablePositions: ["striker"],
    preferredPlayer: "flash",
    trigger: {
      keywords: ["原型", "prototype", "demo", "演示", "验证想法", "快速", "先跑起来"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：快速原型

目标是最快速度让想法可见。放弃完美，追求速度：

**原则：**
- 硬编码 > 抽象（先让它跑，再让它好）
- 注释说明"这是 demo，不用于生产"
- 优先使用最熟悉的技术栈
- 预计 30 分钟内可演示

**交付物：** 可运行的代码 + 截图/录屏描述

**警告：** 此战术产出的代码在正式使用前必须经过 code-review 战术重构。`,
    conflicts: [BUILTIN_TACTIC_IDS.TDD],
    estimatedTokenOverhead: 150,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─── Debug Assist — 调试助手 ────────────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.DEBUG_ASSIST,
    name: "调试助手",
    description: "系统性错误诊断：错误信息解读、根因分析、修复建议。",
    version: "1.0.0",
    category: "debugging",
    applicablePositions: ["captain", "midfielder", "defender"],
    trigger: {
      keywords: ["bug", "错误", "error", "报错", "崩溃", "crash", "调试", "debug", "不工作"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：调试助手

系统性诊断问题，不要猜测，要验证：

**诊断步骤：**
1. **复现**：确认能稳定复现，记录最小复现步骤
2. **隔离**：二分法缩小问题范围
3. **假设**：列出 2-3 个可能原因，按概率排序
4. **验证**：逐一验证假设，优先验证最可能的

**要求：**
- 每个假设都要有验证方法（不是"可能是"，而是"运行 X 命令验证"）
- 找到根因后，检查同类问题是否存在于其他地方
- 修复后写一个回归测试防止复发

**禁止：** 在没有理解根因的情况下随意修改代码。`,
    conflicts: [],
    estimatedTokenOverhead: 190,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─── Tech Writing — 技术文档写作 ────────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.TECH_WRITING,
    name: "技术文档写作",
    description: "编写清晰的技术文档：API 文档、使用指南、架构说明。",
    version: "1.0.0",
    category: "documentation",
    applicablePositions: ["captain", "striker"],
    preferredPlayer: "leo",
    trigger: {
      keywords: ["文档", "documentation", "readme", "api doc", "使用指南", "写文档"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：技术文档写作

目标读者优先，清晰 > 完整：

**文档结构（按类型选择）：**
- **README**：问题 → 解决方案 → 快速开始 → 详细说明
- **API 文档**：功能描述 → 参数 → 返回值 → 示例 → 错误码
- **使用指南**：前置条件 → 步骤（可执行）→ 验证 → 常见问题

**写作原则（Dream XI 风格）：**
- 使用足球隐喻增强品牌一致性（参考 docs/GLOSSARY.md）
- 中英文对照（重要术语）
- 每个代码示例都必须可直接运行
- 使用 \`> [!TIP]\` / \`> [!WARNING]\` 高亮关键信息`,
    conflicts: [],
    estimatedTokenOverhead: 170,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },

  // ─── Post-Match Review — 赛后复盘 ───────────────────────────────────────
  {
    id: BUILTIN_TACTIC_IDS.POST_MATCH_REVIEW,
    name: "赛后复盘",
    description: "功能完成后的结构化复盘：总结成果、分析失误、沉淀经验。",
    version: "1.0.0",
    category: "collaboration",
    applicablePositions: ["captain", "midfielder", "striker", "defender"],
    trigger: {
      keywords: ["复盘", "总结", "赛后", "post-match", "回顾", "经验", "retrospective"],
      explicit: true,
    },
    systemPrompt: `## 当前战术：赛后复盘

按以下模板进行结构化复盘（参考 docs/SOP.md § 赛后复盘）：

\`\`\`markdown
## 赛后复盘 — [功能名称]

### 比分（结果）
- 完成度：X%
- 耗时：预估 Y / 实际 Z

### 精彩回放（做得好的）
- ...

### 失误分析（需改进的）
- 问题：...
- 根因：...
- 下次如何避免：...

### 战术调整
- ...

### 经验沉淀（写入语义记忆）
- ...
\`\`\`

复盘结束后，将"经验沉淀"部分保存到情景记忆，供未来比赛参考。`,
    conflicts: [],
    estimatedTokenOverhead: 200,
    author: "dream-xi",
    createdAt: NOW,
    updatedAt: NOW,
  },
];

/** 按 ID 快速查找战术的 Map */
export const BUILTIN_TACTICS_MAP = new Map(BUILTIN_TACTICS.map((t) => [t.id, t]));

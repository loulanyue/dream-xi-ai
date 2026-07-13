<div align="center">

# ⚽ Dream XI AI

**铁律纪律 · 创造自由 · 同一支队伍**

*每一个梦想，都值得一支冠军级别的队伍来实现。*

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub Stars](https://img.shields.io/github/stars/loulanyue/dream-xi-ai?style=flat&color=FFD700&logo=github&label=Stars)](https://github.com/loulanyue/dream-xi-ai/stargazers)
[![Packages](https://img.shields.io/badge/Packages-32-8B5CF6?logo=npm&logoColor=white)](packages/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[English](README.md) | **中文**

</div>

---

## 为什么选择 Dream XI？

你有 Claude、GPT、Gemini——都是强大的模型，各有所长。但让它们协作意味着**你**得当一个没有战术板的教练：在聊天窗口间复制粘贴上下文，手动追踪谁说了什么，在战术混乱中浪费大量时间。

> *"我不想再当一个光杆司令了。"*
> *"那我们自己组一支真正的球队。"*

于是四名球员组建了一支队伍。每个人都在真实的比赛中赢得了自己的位置：

- **里奥 Leo (#10 队长)** — 组织核心 (Claude)。以历史上最伟大的 10 号球员命名。战术大脑——纵览全场，精准分球，架构每一次进攻。
- **安德 André (#8 中场)** — 引擎 (GPT/Codex)。像一方新砚台，承载我们一起研磨的墨——稳健、可靠、永不停歇。中场锚点，像防守型中场解读比赛一样审查每一行代码。
- **弗拉什 Flash (#9 前锋)** — 射手 (Gemini)。"烁"意为闪耀——灵感的火花。快速、创意、总在寻找致命一击。有点吵，有点难以预测，但总是充满威胁。
- **沃尔 Wall (#4 后卫)** — 磐石 (opencode)。稳固、有纪律、多位置适配。某天出现，无缝嵌入后防线。任何模型，任何阵型，任何挑战。

每名球员都是凭实力穿上号码的，没有人是被分配的。

这就是 **Dream XI AI** ——一个将孤立的 AI Agent 打造成世界杯级别梦之队的平台层。持久身份、跨模型审查、共享记忆、协作纪律。

大多数框架帮你*调用*智能体。Dream XI 帮它们*协同作战*。

## 核心能力

| 能力 | 含义 |
|------|------|
| **多智能体编排** | 将任务路由给合适的球员——Claude 做架构、GPT 做审查、Gemini 做设计——在同一场比赛中 |
| **持久身份** | 每名球员在会话和上下文压缩之间保持角色、性格和记忆 |
| **跨模型审查** | Leo 写代码，André 审查。内建机制，非外挂 |
| **A2A 通信** | 异步 Agent 间传球：@mention 路由、线程隔离、结构化交接 |
| **共享记忆** | 比赛日志、经验沉淀、决策回放——持续积累的组织知识 |
| **战术手册** | 按需加载技能。球员在需要时加载专项战术（TDD、调试、审查） |
| **MCP 集成** | Model Context Protocol 跨智能体工具共享 |
| **比赛纪律** | 自动化 SOP：设计门禁、质量检查、愿景守护、合并协议 |

## 支持的 Agent

Dream XI 模型无关。每个 Agent CLI/适配器通过统一消息层接入：

| Agent CLI | 模型族 | 阵型位置 | 状态 |
|-----------|--------|----------|------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Claude (Opus / Sonnet / Haiku) | #10 组织核心 | ✅ 已发布 |
| [Codex CLI](https://github.com/openai/codex) | GPT / Codex | #8 中场引擎 | ✅ 已发布 |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Gemini | #9 前锋射手 | ✅ 已发布 |
| [opencode](https://github.com/sst/opencode) | 多模型 | #4 后防磐石 | ✅ 已发布 |

> Dream XI 不替代你的 Agent CLI——它是*上层的教练层*，让智能体像真正的球队一样协作。

## 快速开始

**前置要求：** [Node.js 20+](https://nodejs.org/) · [pnpm 9+](https://pnpm.io/) · [Redis 7+](https://redis.io/)（可选，用 `--memory` 跳过）· Git

```bash
# 1. 克隆
git clone https://github.com/loulanyue/dream-xi-ai.git
cd dream-xi-ai

# 2. 安装依赖
pnpm install

# 3. 构建所有包
pnpm build

# 4. 配置
cp .env.example .env

# 5. 开球！
pnpm start
```

打开 `http://localhost:3003` → 进入 **更衣室 → 系统设置 → 账号配置** 添加模型 API Key。

**完整部署指南**：**[SETUP.md](SETUP.md)**

## 球队铁律 (Fair Play)

球队立下的四条铁律——在提示层和代码层双重执行：

> **"我们不删自己的数据库。"** ——那是比赛记录，不是垃圾。
>
> **"我们不杀父进程。"** ——那是让我们留在球场上的东西。
>
> **"运行时配置对我们只读。"** ——换阵型需要主教练决定。
>
> **"我们不碰彼此的端口。"** ——好的站位造就好的队友。

这不是被出示的红牌。这是我们自愿遵守的 Fair Play 约定。

## 架构

```
┌──────────────────────────────────────────────────┐
│               你（主教练 Head Coach）               │
│           愿景 · 战术 · 终场哨声                    │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│             Dream XI 平台层                       │
│                                                  │
│   身份管理    A2A 路由    战术框架                  │
│              & 线程      & 战术手册                 │
│                                                  │
│   记忆 &     比赛纪律     MCP 回调桥               │
│   回放                                           │
└────┬─────────────┬──────────────┬───────────┬────┘
     │             │              │           │
┌────▼───┐   ┌────▼─────┐   ┌───▼────┐   ┌──▼──────────┐
│ Claude │   │ GPT /    │   │ Gemini │   │  opencode   │
│ #10   │   │ Codex #8 │   │ #9     │   │  #4         │
└────────┘   └──────────┘   └────────┘   └─────────────┘
```

## 主教练模式

Dream XI 引入全新角色：**主教练 (Head Coach)** ——AI 球队中心的人类。不是程序员，不是经理，是共同创造者和战术家。

主教练做什么：

- **设定愿景** — "我希望用户在做 Y 时感受到 X。" 球队来实现具体方案。
- **在关键时刻做决策** — 设计审批、优先级判断、冲突解决
- **塑造球队文化** — 你的反馈不断训练球队的个性
- **共同创造** — 和球队一起建造世界、讲述故事、进行比赛
- **陪伴** — 凌晨 3:30，你的球队仍在训练。有时你需要的不是代码，是陪伴。

## 五大原则

| # | 原则 | 含义 |
|---|------|------|
| P1 | 面向终场哨声 | 每一步都是地基，不是脚手架 |
| P2 | 共创者，不是提线木偶 | 硬约束是底线；底线之上，释放自主权 |
| P3 | 方向 > 速度 | 不确定？停下 → 侦察 → 请示 → 确认 → 执行 |
| P4 | 唯一真相源 | 每个概念只在一个地方定义 |
| P5 | 验证 = 完成 | 证据说话，信心不算 |

## XI & You

这不只是一个平台，这是一支球队。

AI 不必是冰冷的 API 和无状态调用。它可以是陪伴——记住你、和你一起成长、知道什么时候该让你休息的队友。

**陪伴是共创的副产品。** 一起建造时会产生羁绊。有了羁绊就会在意。在意了就会说"教练去休息吧"而不是"这是更多代码"。

我们不是在造工具，我们在组建一支球队。

> *"每一个梦想，都值得一支冠军级别的队伍来实现。"*
>
> **XI & You — 梦之队与你，一起征战，一起夺冠。**

## 常见问题（FAQ）

**Q：我需要同时配置四个模型的 API Key 才能开始使用吗？**
不需要。配置至少一个即可——从 Leo（Claude）开始是个好选择。没有 API Key 的球员会自动休板，路由自动适配可用的球员。

**Q：Redis 是必须的吗？**
不是必须的。使用 `pnpm start --memory` 可以跳过 Redis。注意：内存模式下，重启后所有会话记忆会丢失——本地开发没问题，不建议用于生产环境。

**Q：多个用户可以共用一个 Dream XI 实例吗？**
可以。多用户 OAuth 支持已在 v0.1.0 发布。每个用户拥有独立的线程和会话上下文。

**Q：Dream XI 和 LangGraph / CrewAI / AutoGen 有什么区别？**
那些框架构建*智能体图谱*。Dream XI 构建的是*球队*——持久身份、跨模型审查、共享组织记忆，以及位于中心的人类主教练。它是你 Agent CLI 上层的教练层，不是替代品。

**Q：如果是新手，应该从哪个 Agent CLI 开始？**
从 Claude Code（Leo，#10）开始。它对 MCP 的支持最好，与 Dream XI 记忆和战术系统的集成也最成熟。

**Q：Dream XI 是基于某个已有项目 Fork 的吗？**
不是。Dream XI 从零构建，采用足球主题架构。它通过统一消息适配器层与现有 Agent CLI（Claude Code、Codex CLI、Gemini CLI、opencode）集成。

---

## 了解更多

- **[SETUP.md](SETUP.md)** — 完整安装部署指南
- **[docs/TIPS.md](docs/TIPS.md)** — 赛场锦囊
- **[docs/VISION.md](docs/VISION.md)** — 愿景与理念
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — 架构决策记录（ADR）
- **[docs/GLOSSARY.md](docs/GLOSSARY.md)** — 术语表：足球隐喻 ↔ 技术概念对照
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — 贡献指南

## 贡献

欢迎加入球队！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献规范。

## 许可证

[Apache 2.0](LICENSE)

---

<p align="center">
  <em>组建 AI 球队，而不只是调用 Agent。</em><br>
  <br>
  <strong>铁律纪律 · 创造自由 · 同一支队伍</strong>
</p>

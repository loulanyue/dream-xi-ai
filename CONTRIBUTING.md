# 贡献指南 — 加入球队（Contributing）

感谢你愿意加入 Dream XI 的球队！我们欢迎所有形式的贡献。

---

## 目录

- [前置要求](#前置要求)
- [加入球队（提交 PR）](#加入球队提交-pr)
- [训练流程（开发工作流）](#训练流程开发工作流)
- [球衣规范（代码风格）](#球衣规范代码风格)
- [传球规范（Commit 规范）](#传球规范commit-规范)
- [比赛纪律（审查协议）](#比赛纪律审查协议)

---

## 前置要求

在踏上球场之前，请确保装备齐全：

1. [Node.js 20+](https://nodejs.org/)
2. [pnpm 9+](https://pnpm.io/)
3. [Git](https://git-scm.com/downloads)
4. [Redis 7+](https://redis.io/)（可选，用 `--memory` 模式跳过）

```bash
node --version   # v20+
pnpm --version   # 9+
git --version
```

---

## 加入球队（提交 PR）

> [!NOTE]
> 如果你的 PR 涉及重大变更（如新增球员位置、修改核心战术逻辑），建议先通过 Issue 和主教练讨论，取得共识后再提交，以避免大规模返工。

1. **Fork** 本仓库并克隆到本地：
   ```bash
   git clone https://github.com/your-username/dream-xi-ai.git
   cd dream-xi-ai
   ```

2. **创建战术分支**：
   ```bash
   git checkout -b feat/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

3. **安装依赖并构建**：
   ```bash
   pnpm install
   pnpm build
   ```

4. **进行修改**，确保所有测试通过：
   ```bash
   pnpm test
   pnpm gate    # 赛前检查
   ```

5. **提交变更**（遵循[传球规范](#传球规范commit-规范)）：
   ```bash
   git add .
   git commit -m "feat(striker): add video analysis support for Flash"
   ```

6. **推送并发起 PR**：
   ```bash
   git push origin feat/your-feature-name
   ```

---

## 训练流程（开发工作流）

```bash
# 日常开发
pnpm install          # 安装依赖
pnpm build            # 构建所有包
pnpm start            # 启动开发服务器
pnpm test             # 运行测试
pnpm gate             # 赛前合并检查

# 单包开发
pnpm --filter @dream-xi/api dev
pnpm --filter @dream-xi/web dev
```

---

## 球衣规范（代码风格）

- **TypeScript** 优先，严格模式
- 使用 [Biome](https://biomejs.dev/) 进行代码格式化和 lint
- 文件命名：`kebab-case`
- 组件命名：`PascalCase`
- 函数命名：`camelCase`
- 常量命名：`UPPER_SNAKE_CASE`
- 中文注释优先，关键逻辑必须添加注释

---

## 传球规范（Commit 规范）

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范：

```
<类型>(<位置/范围>): <简短描述>
```

### 类型说明

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能（进球） | `feat(captain): add tactical planning UI` |
| `fix` | Bug 修复（防守补位） | `fix(midfielder): handle timeout in review flow` |
| `docs` | 文档更新（战术板） | `docs(readme): update architecture diagram` |
| `refactor` | 重构（阵型调整） | `refactor(striker): extract design module` |
| `chore` | 构建/工具（场地维护） | `chore(deps): bump typescript to 5.5` |
| `test` | 测试（训练赛） | `test(defender): add integration tests for Wall` |
| `style` | 代码格式（球衣整理） | `style(all): apply biome formatting` |

### 位置/范围建议

| 范围 | 说明 |
|------|------|
| `captain` | #10 队长 Leo 相关 |
| `midfielder` | #8 中场 André 相关 |
| `striker` | #9 前锋 Flash 相关 |
| `defender` | #4 后卫 Wall 相关 |
| `pitch` | 核心平台层 |
| `dugout` | UI / 控制台 |
| `deps` | 依赖更新 |

---

## 比赛纪律（审查协议）

- 同一球员（同一个人）不能审查自己的代码
- 跨位置审查优先：中场审查队长代码，前锋审查中场代码
- 每条审查发现必须有明确严重等级：
  - **P1（红牌）**：阻断合并，必须修复
  - **P2（黄牌）**：应该修复，本次或下次
  - **P3（角球）**：锦上添花，不阻断

---

## PR 检查清单

提交 PR 前，请确认：

- [ ] 代码通过 `pnpm gate`（赛前检查）
- [ ] 新功能有对应测试
- [ ] 文档已更新（如适用）
- [ ] Commit 消息遵循传球规范
- [ ] 已请求跨位置审查

---

## 新增包指南（上场新球员）

> 适合希望向 monorepo 中添加新 `packages/` 包的贡献者。

### 步骤

1. **创建包目录结构**

   ```bash
   mkdir -p packages/my-package/src
   ```

2. **创建 `package.json`**（参考已有包，如 `packages/logger/package.json`）

   ```json
   {
     "name": "@dream-xi/my-package",
     "version": "0.1.0-alpha",
     "description": "...",
     "license": "Apache-2.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
     },
     "scripts": {
       "build": "tsc --project tsconfig.json",
       "typecheck": "tsc --noEmit",
       "clean": "rimraf dist"
     },
     "devDependencies": { "rimraf": "^5.0.0", "typescript": "^5.6.0" }
   }
   ```

   > [!IMPORTANT]
   > 所有内部 `@dream-xi/*` 依赖必须使用 `"workspace:*"` 版本协议。

3. **创建 `tsconfig.json`**（继承根配置）

   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": { "rootDir": "src", "outDir": "dist" },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

4. **编写 `src/index.ts`**（包入口）

5. **运行包健康检查**

   ```bash
   pnpm check:packages
   ```

   检查项包括：必填字段、semver 格式、`workspace:*` 依赖、`tsconfig.json`、`src/index.ts`、`Apache-2.0` 协议。

6. **更新 `CHANGELOG.md`**，记录新包的功能说明。

---

## 资源

- [快速开始](SETUP.md)
- [开发者指南](docs/DEVELOPMENT.md)
- [赛场锦囊](docs/TIPS.md)
- [战术纪律手册](docs/SOP.md)
- [安全政策](SECURITY.md)
- [支持渠道](SUPPORT.md)

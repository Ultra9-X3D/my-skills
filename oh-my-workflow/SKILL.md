---
name: oh-my-workflow
description: >
  用 Claude Code Workflow 把较大需求跑成固定流水线：boot 分档 → 独立 worktree →
  design（人读）→ tech-design（施工手书）→ 自包含执行计划 → 按 stage 串行落地（一笔一个
  commit + runlog）→ 每段审查只出吸收清单 → 大档终审 2 轮 → agent-browser 验收 →
  pr-walkthrough 走读 → 单个 PR（PR 正文不放走读报告链接）。当用户要求用 workflow /
  多 agent 编排完成一个特性、且期望最后只提一个 PR 时使用。不要用于单文件小改动。
compatibility: Requires Claude Code Workflow. Opening the PR requires the pr-walkthrough skill plus its Feishu dependencies.
argument-hint: "<需求，或从哪一阶段继续>"
---

# oh-my-workflow

编排者。人是卡口，循环和闸门在 workflow 脚本里。缺 Claude Code `Workflow` 就停。一个 worktree、一条分支、一个 PR。

脚本返回 `halt` 时必须停，禁止再派 fix、禁止跳审查、禁止用自己的文字顶上。判定信 git 和 `.ai_docs`，不信自述。

## 资源

| 文件 | 何时读 |
|------|--------|
| [references/01-boot-and-artifacts.md](references/01-boot-and-artifacts.md) | boot、续跑、写任何 `.ai_docs` 文件前 |
| [references/02-design-and-plan.md](references/02-design-and-plan.md) | 写 design / tech-design / 阶段划分 / 执行计划前 |
| [references/03-workflow-authoring.md](references/03-workflow-authoring.md) | 建 worktree、填 CONFIG、起 Workflow 前 |
| [references/04-agent-briefing.md](references/04-agent-briefing.md) | boot 复制 BRIEFING.md 时 |
| [references/05-review.md](references/05-review.md) | 读 halt 含义、吸收规则时 |
| [references/06-monitoring.md](references/06-monitoring.md) | 第一个 workflow 开跑之后 |
| [references/07-e2e-and-pr.md](references/07-e2e-and-pr.md) | 终审之后：验收、走读、开 PR |

## 分档（唯一路由）

用户点名听用户；否则 **中**。禁止在 design 被认可（attended）或吸收落地（unattended）之前起实现进程。

| 档 | 走哪些步 |
|----|----------|
| 小 | 0 → 1 → 2 → 4（1 个 stage，手书 = `design.md`）→ 5（`doDrift=false`）→ 7 → 8 → 9。跳过 3、6 |
| 中 | 0 → 1 → 2 → 3（审查 1 轮）→ 4（恰好 1 个开发 stage）→ 5 → 7 → 8 → 9。跳过 6 |
| 大 | 0 → 1 → 2 → 3（审查 2 轮）→ 4（开发 stage ≤ 4）→ 5 每个 stage → 6 → 7 → 8 → 9 |

装不进该档的 stage 上限：停下问要不要另开 PR。不准加 stage，不准起实现。

## 流程

标 🚧 的地方停下等用户。第 5–6 步只启动脚本、读返回值；commit 循环、审查、收敛在模板里。

### 0. boot 与 worktree

1. 确认能调 `Workflow`。不能则停。
2. worktree 根目录必须已由用户指定。
3. 若 `.ai_docs/<slug>/runlog/000-boot.md` 已存在且是同一任务：走续跑。
4. 否则从最新 `origin/main` 建 worktree 与分支，写 `000-boot.md`。
5. 把 `04-agent-briefing.md` 的 BRIEFING 原文复制为 `.ai_docs/<slug>/BRIEFING.md`。之后禁止粘贴 briefing，agent 只 Read 这份文件。
6. **在场**：用户说了「我不在 / 你自行 / 开跑后离开」→ `unattended`；其余 → `attended`。说不清问一次。
7. **分档**：按上表。

完成：boot 与 `BRIEFING.md` 已写，工作区干净。

### 1. 摸清现状

在 worktree 里读代码。没读过触达路径不准写 design / 划分阶段。

### 2. 意图阐明 → `design.md`

按 `02-design-and-plan.md` 写给人读的 `design.md`，含阶段草案。

- `attended`：🚧 **停下等认可**。未获认可不得进入下一步。
- `unattended`：起 `assets/review-workflow.template.ts`（`rounds=1`，`seedLenses=roi`，`doDrift=false`，`doScope=false`）。只按吸收清单改文件。`halt` 则停。

design 定稿后若体量对不上当前档：只允许改一档，写入 boot。

### 3. tech-design

小档跳过。写自包含 `tech-design.md`。然后起 `review-workflow.template.ts`：中档 `rounds=1`，大档 `rounds=2`。`halt` 则停。

### 4. `execution-plan.md`

按 `02-design-and-plan.md` + `assets/execution-plan.template.md` 写。`attended` 且用户要求先认可划分：先交划分再写成 plan。

完成：每个 stage 有 `plan_item_id`、commit 列表、允许路径、验收命令。worktree 干净、依赖已装。

### 5. 按 stage 交付

每个开发 stage **一次** `Workflow`：`assets/dev-stage-workflow.template.ts`。只填 CONFIG（含 `commits`、`briefingPath`、`review.rounds=1`）。不要改 `meta.phases`，不要拆成「先实现再决定审不审」。

记下 `stage_base_sha` / `stage_head_sha` 进 `runlog/s<NN>-status.md`。

返回 `halt`：停，按 `06-monitoring.md` 升级。禁止忽略 `halt` 再派 fix。`converged=true` 才能开下一 stage。

### 6. 终审（仅大档）

一次 `Workflow`：`assets/review-workflow.template.ts`，`rounds=2`，范围 `workflow_base_sha..HEAD`。`halt` 则停，包括 `finding-explosion`。

### 7–9. 验收、走读、PR

见 `07-e2e-and-pr.md`。顺序固定：E2E → `pr-walkthrough` → 开 PR。走读没完成不准开 PR。报告链接不进 PR、不进仓库文件。

## 不可协商

- 每个 agent 必须先 Read `.ai_docs/<slug>/BRIEFING.md`。禁止把 briefing 粘进 prompt 当摘要。
- 只改模板的 CONFIG。禁止改 `meta.phases`、禁止删 `halt` 分支、禁止给审查类 agent 开写业务代码的权限。
- 代码改动只来自实现 / fix agent，且只按吸收清单。编排者不得给清单增删条目。
- 扩范围或缩范围都要问用户（attended）或升级（unattended）。
- 重叠写入必须串行。不准用 isolation worktree 绕过（隔离改动不会合回本分支）。

## 参数（缺省值，开跑前跟用户对齐差异项）

| 参数 | 默认 |
| --- | --- |
| worktree 根目录 | 用户指定，必须明确 |
| base ref | 最新 `origin/main` |
| 档 | 中（用户点名除外） |
| 在场 | `attended`（用户明确离开才 `unattended`） |
| 产物根 | worktree 内 `.ai_docs/<slug>/` |
| briefing | `.ai_docs/<slug>/BRIEFING.md`（boot 从 04 复制） |
| 开发 stage 上限 | 小/中 = 1；大 = 4 |
| 每开发 stage 审查 | `rounds=1`（写在脚本 CONFIG，不是口头） |
| 大档终审 | `rounds=2` |
| 模型 / effort | `opus` / `xhigh` |
| 单 agent 预算 | 300k context（估法见 02） |
| 审查维度上限 | 6 |
| 交付 | 单个 PR |
| 走读 | 开 PR 前调用 `pr-walkthrough`；链接不进 PR |
| 计划文档语言 | 简体中文（代码与标识符英文） |

## assets

- `assets/execution-plan.template.md` — 只填内容，不填 briefing 原文
- `assets/dev-stage-workflow.template.ts` — 一个 stage 的全部循环与闸门
- `assets/review-workflow.template.ts` — design / tech-design / 终审

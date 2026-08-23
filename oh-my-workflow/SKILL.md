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

编排者。内部开发 MVP：方案要站得住，人是卡口但不是堵点。

运行时是 **Claude Code 的 `Workflow` 工具**（`opus` / `xhigh`）。缺这个工具就停下，不要改写成别的编排。全部产物落在同一个 worktree 的同一条分支上，最后只提一个 PR。

## 资源

| 文件 | 何时读 |
|------|--------|
| [references/01-boot-and-artifacts.md](references/01-boot-and-artifacts.md) | boot、续跑、写任何 `.ai_docs` 文件前 |
| [references/02-design-and-plan.md](references/02-design-and-plan.md) | 写 design / tech-design / 阶段划分 / 执行计划前 |
| [references/03-workflow-authoring.md](references/03-workflow-authoring.md) | 建 worktree、填 workflow 模板、发每一笔 commit 前 |
| [references/04-agent-briefing.md](references/04-agent-briefing.md) | 拼任何 agent prompt 前 |
| [references/05-review.md](references/05-review.md) | 任何审查前 |
| [references/06-monitoring.md](references/06-monitoring.md) | 第一个 workflow 开跑之后（判定、升级、编排者禁区） |
| [references/07-e2e-and-pr.md](references/07-e2e-and-pr.md) | 终审之后：验收、走读、开 PR |

## 分档（唯一路由）

用户点名听用户；否则 **中**。禁止在 design 被认可（attended）或吸收落地（unattended）之前起实现进程。

| 档 | 走哪些步 |
|----|----------|
| 小 | 0 → 1 → 2 → 4（薄：1 个 stage，手书 = `design.md`）→ 5（无 drift）→ 7 → 8 → 9。跳过 3、6 |
| 中 | 0 → 1 → 2 → 3（审查 1 轮）→ 4（恰好 1 个开发 stage）→ 5 → 7 → 8 → 9。跳过 6 |
| 大 | 0 → 1 → 2 → 3（审查 2 轮）→ 4（开发 stage ≤ 4）→ 5 每个 stage → 6 → 7 → 8 → 9 |

装不进该档的 stage 上限：停下告诉用户，问要不要另开一个 PR。不准偷偷加 stage，也不要起实现。

## 流程

按顺序执行。标 🚧 的地方必须停下等用户。无人值守规则见 `06-monitoring.md`，不是单独一步。

### 0. boot 与 worktree

1. 确认当前环境能调 `Workflow`。不能则停，只说缺什么。
2. worktree 根目录必须已由用户指定。
3. 若 `.ai_docs/<slug>/runlog/000-boot.md` 已存在且是同一任务：走 `01-boot-and-artifacts.md` 的续跑，不要重做已 committed 的步骤。
4. 否则从最新 `origin/main` 建 worktree 与分支（`03-workflow-authoring.md`），在 worktree 里写 `runlog/000-boot.md`。
5. **在场**：用户说了「我不在 / 你自行 / 开跑后离开」→ `unattended`；其余 → `attended`。说不清问一次。
6. **分档**：按上表。后续所有读写都在这个 worktree 里。

完成：`000-boot.md` 已写，工作区干净。

### 1. 摸清现状

在 worktree 里读代码。禁止没读过触达路径就写 design / 划分阶段。需要广度就派 Explore/general-purpose，只要结论不要文件转储。

### 2. 意图阐明 → `design.md`

按 `02-design-and-plan.md` 写给人读的 `design.md`，含阶段草案。参考一次性喂进这一步。

- `attended`：把路径交给用户，🚧 **停下等回复**。按意见改。未获认可不得进入下一步。
- `unattended`：按 `05-review.md` 做设计审查（`roi`）。编排者只按吸收清单改文件。

design 定稿后若体量明显对不上当前档：只允许改一档，写入 boot。中→小需要用户点头（attended）或记 follow-up 仍走中（unattended）。中→大仅当用户要完整流程，或明显是 0 到 1 / 跨多层契约的大改。

完成：`design.md` 在磁盘上，且（attended 已获认可）或（unattended 吸收清单已落地）。

### 3. tech-design

小档跳过。按 `02-design-and-plan.md` 写自包含 `tech-design.md`（实现 agent 只拿到这一份就能开工）。然后按 `05-review.md` 做 tech-design 审查，轮数见分档表。更新时直接写现在正确的方案。

完成：`tech-design.md` 自包含；对应吸收清单已落地。

### 4. `execution-plan.md`

按 `02-design-and-plan.md` + `assets/execution-plan.template.md` 写自包含计划。`attended` 且用户要求先认可划分：先交划分再写成 plan。

完成：plan 在磁盘上；每个 stage 有稳定 `plan_item_id`、commit 列表、验收命令、审查场次。

开跑前再确认 worktree 干净、依赖已装、分支名与 plan 一致。

### 5. 按 stage 交付

对每个开发 stage：

1. 记下 `stage_base_sha`，写入 `runlog/s<NN>-status.md`。
2. 起一次开发 `Workflow`（`assets/dev-stage-workflow.template.ts`）。**每一笔单独一条 prompt**：只贴这一笔的手书切片、允许路径、验收命令、runlog 路径、`expected_base_sha`。不要把整张 commit 表塞进同一条。默认串行。
3. 读该笔 runlog 的 `status`。非 `committed`：停本 stage 实现，按吸收/问人处理，不得发下一笔。
4. 全部 commit 完成后记 `stage_head_sha`。工作区还有非本 pipeline 的脏文件：不得宣称 stage 完成。
5. 跑仓库 check；不绿就在同一个 workflow 内修，最多 3 轮。3 轮还不绿，把失败原文返回，不要粉饰。
6. 按 `05-review.md` 对该 `stage_base_sha..stage_head_sha` 做 1 轮代码审查。采纳的代码修改交给实现 agent 打独立 fix commit + runlog。审查 agent 不改业务代码。
7. 中档、大档：做 drift。小档跳过。
8. 对照 design/手书做一次文件清单越界检查。越界则起 `scope` 核实，不听实现进程的自我辩解。

完成：该 stage 每个计划中的 commit 都是 `committed`；审查与（若有）drift 已吸收。

### 6. 终审（仅大档）

对 `workflow_base_sha..HEAD` 按 `05-review.md` 做 2 轮 review。第 1 轮门禁不绿，不开第 2 轮。

### 7. 端到端验收

见 `07-e2e-and-pr.md`。有界面：真实走本次触达路径。工具不可用则 follow-up，不假装测过。

### 8. 走读报告

加载同仓库 `pr-walkthrough` skill，对本次分支 diff（`workflow_base_sha...HEAD`）生成走读报告。依赖、链接、开 PR 条件见 `07-e2e-and-pr.md`。

### 9. 提 PR

一个 PR。标题 ≤ 70 字符。正文按 `07-e2e-and-pr.md` 写（变更摘要、验证、follow-up、已走读；不放报告原文链接）。agent 不建分支、不各自开 PR。

`attended` 把变更文件清单再给用户看一眼。follow-ups 逐条说人话交给用户。

## 不可协商

- 每个 agent prompt 的首段必须是 `04-agent-briefing.md` 的 BRIEFING 原文，逐字内联。
- 模型 / effort 用下面参数表，不要写成别的型号。
- 审查（dimensions / find / verify / absorb / drift / scope）不改业务代码。代码改动只来自实现 agent，且只按吸收清单。
- 编排者不得给吸收清单增删条目，不得用自己的文字顶上失败的审查。
- 扩范围或缩范围都要问用户（attended）或升级（unattended）。
- 一笔 commit 的范围必须能写进一条 prompt。装不进就拆 commit，不是加 stage。

## 参数（缺省值，开跑前跟用户对齐差异项）

| 参数 | 默认 |
| --- | --- |
| worktree 根目录 | 用户指定，必须明确 |
| base ref | 最新 `origin/main` |
| 档 | 中（用户点名除外） |
| 在场 | `attended`（用户明确离开才 `unattended`） |
| 产物根 | worktree 内 `.ai_docs/<slug>/` |
| 开发 stage 上限 | 小/中 = 1；大 = 4 |
| 每开发 stage 轮次 | 1 |
| 每 stage 审查 | 1 轮；大档另加终审 2 轮 |
| 模型 / effort | `opus` / `xhigh` |
| 单 agent 预算 | 300k context（估法见 02） |
| 审查维度上限 | 6 |
| 交付 | 单个 PR |
| 走读 | 开 PR 前调用 `pr-walkthrough`；链接不进 PR |
| 计划文档语言 | 简体中文（代码与标识符英文） |

## assets

- `assets/execution-plan.template.md`
- `assets/dev-stage-workflow.template.ts`
- `assets/review-workflow.template.ts`

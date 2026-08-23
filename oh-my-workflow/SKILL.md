---
name: oh-my-workflow
description: 把一个较大的需求跑成固定流水线：阶段划分 → 用户审批 → 自包含执行计划 → 新建 worktree → 每阶段一个开发 workflow（各 1 轮）→ 一个 review workflow（2 轮）→ 无人值守监控 → agent-browser 端到端验收与 UI/UX 修复 → 合成单个 PR。当用户要求用 workflow / 多 agent 编排完成一个特性、且期望最后只提一个 PR 时使用。不要用于单文件小改动。
---

# oh-my-workflow

一条从需求到单个 PR 的编排流水线。核心约束：**开发阶段 ≤ 4 个、每个开发阶段跑 1 轮、review workflow 跑 2 轮、全部产物落在同一个 worktree 的同一个分支上、最后只提一个 PR**。

## 门禁与流程

按顺序执行，标 🚧 的地方必须停下等用户。

1. **摸清现状** — 先读代码。禁止在没读过触达路径的情况下划分阶段。需要广度就派 Explore/general-purpose，只要结论不要文件转储。
2. **阶段划分提案** — 输出阶段表交给用户。见 `references/01-stage-split.md`。
   🚧 **等用户认可后才继续。** 这一步只给划分，不写执行计划、不建 worktree、不起 workflow。
3. **写自包含执行计划** — 一份新文档，不引用任何其它计划文档。见 `references/02-plan-format.md` + `assets/execution-plan.template.md`。
4. **准备 worktree** — 从最新 `origin/main` 在用户指定的 worktree 根目录下新建；后续所有 workflow 都在这一个 worktree、这一个分支上跑。见 `references/03-workflow-authoring.md#worktree`。
5. **逐阶段跑开发 workflow** — 一个阶段 = 一次 `Workflow` 调用 = 1 轮。串行推进：读完上一阶段结果、确认门禁通过，再起下一个。
6. **跑 review workflow** — 一次调用内做 2 轮完整 review（找 → 修 → 复验，然后在修复产物上重跑全套）。
7. **无人值守监控** — 用户在 workflow 开跑后就离开了。自行监控、判定、决策与升级。见 `references/05-monitoring.md`。
8. **端到端验收** — 用 agent-browser 真实走一遍本次触达的所有用户路径，修明确的展示问题和不和谐的 UI/UX。见 `references/06-e2e-acceptance.md`。
9. **提 PR** — 一个 PR，标题 ≤ 70 字符，描述里写变更摘要、验证过什么、跳过了什么。

## 不可协商的规则

- **每个 agent 的 prompt 首段必须逐字内联 briefing 全文**（`references/04-agent-briefing.md`）。子 agent 看不到主会话上下文，不内联等于没说。
- **Claude 部分统一 `opus-5` + `xhigh`**：`agent(prompt, {model: 'opus', effort: 'xhigh'})`。
- **开发阶段 ≤ 4**。装不下就往下拆 commit / 拆 agent，不是加阶段。
- **单阶段预算按 300k context 估**：阶段内任何单个 agent 的工作量都要能在 300k 内跑完。
- **一个 PR**。各 workflow 不各自建分支、不各自提 PR。
- **每阶段必须自己收口**：typecheck / lint / test / 仓库自带的 check 脚本全过，才算这阶段结束。没过就在同一个 workflow 内补 fix agent，不许静默通过。

## 参数（缺省值，开跑前跟用户对齐差异项）

| 参数 | 默认 |
| --- | --- |
| worktree 根目录 | 用户指定，必须明确 |
| base ref | 最新 `origin/main` |
| 开发阶段数上限 | 4 |
| 每开发阶段轮次 | 1 |
| review workflow | 1 个，内含 2 轮 |
| 模型 / effort | `opus` / `xhigh` |
| 单 agent context 预算 | 300k |
| 交付形态 | 单个 PR |
| 计划文档语言 | 简体中文（代码与标识符英文）|

## references

- `references/01-stage-split.md` — 怎么切阶段和 commit，怎么估 300k 预算
- `references/02-plan-format.md` — 自包含执行计划要写什么、不能写什么
- `references/03-workflow-authoring.md` — worktree、workflow 脚本结构、开发/review 两套模板
- `references/04-agent-briefing.md` — 强制 briefing 原文
- `references/05-monitoring.md` — 无人值守时的监控、判定与升级规则
- `references/06-e2e-acceptance.md` — agent-browser 验收清单与修复边界

## assets

- `assets/execution-plan.template.md`
- `assets/dev-stage-workflow.template.ts`
- `assets/review-workflow.template.ts`

# <特性名> 执行计划

> 本文档自包含。执行者无需阅读任何其它计划文档。

## 1. 背景与目标

**要解决什么**：…

**做完之后系统能做什么**：…

**非目标**（明确不在本次范围）：
- …

## 2. 现状（已确认的代码事实）

| 关注点 | 位置 | 结论 |
| --- | --- | --- |
| … | `path/to/file.ts` | … |

## 3. 总体设计

**数据流**：…

**契约变更**：…

**关键决策**：
- 选 A 而不是 B，因为 …

## 4. 阶段拆分

### 阶段 1 — <名字>

- **目标**：…
- **范围**：…
- **不做**：…（留给阶段 N）
- **commits**：
  - `s1-c1` `type(scope): subject` — 允许路径：… — …
  - `s1-c2` `type(scope): subject` — 允许路径：… — …
- **完成判据**：
  ```bash
  <可直接执行的命令>
  ```
- **审查**：1 轮 arch+bug → abs；（中/大）drift；越界核实

### 阶段 2 — <名字>

（同上；小/中档只有阶段 1）

## 5. 执行方式

| 项 | 值 |
| --- | --- |
| 档 | 小 / 中 / 大 |
| 在场 | attended / unattended |
| 产物根 | `.ai_docs/<slug>/` |
| worktree | `<WORKTREE_ROOT>/<name>` |
| base | 最新 `origin/main` |
| 分支 | `<branch>` |
| `workflow_base_sha` | `<boot 时 HEAD>` |
| 开发阶段 | 按 SKILL.md 分档表 |
| 模型 / effort | 按 SKILL.md 参数表 |
| 交付 | 单个 PR；开 PR 前走读；报告链接不进 PR |

所有阶段在同一 worktree、同一分支上累积提交。实现 agent 不建分支、不 push、不开 PR。一笔一个 commit，串行，`expected_base_sha` 链到上一笔 HEAD。

## 6. Agent Briefing

路径：`.ai_docs/<slug>/BRIEFING.md`（boot 从 `04-agent-briefing.md` 复制）。每个 agent 先 Read 该文件，不要把原文粘进计划或 prompt。

## 7. 整体完成判据

```bash
<全仓 check 命令清单>
```

agent-browser 走查路径：
- …

走读与 PR 正文：见 `oh-my-workflow/references/07-e2e-and-pr.md`。

## 8. 风险与假设

- **假设**：…
- **风险**：… → 应对：…
- **follow-ups**：…

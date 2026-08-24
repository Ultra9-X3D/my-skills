# worktree 与启动协议

循环、闸门、收敛在 `assets/*.template.ts` 里。这里只写：怎么建现场、CONFIG 填什么、返回值怎么处理。

## worktree

所有 workflow 共用一个 worktree、一个分支：

```bash
git fetch origin main
git worktree add -b <branch> <WORKTREE_ROOT>/<name> origin/main
```

- **不要用 `git stash`**：stash 栈跨 worktree 共享。要暂存就打临时 WIP commit。
- 不要为审查另建 worktree / 分支。重叠写入必须串行。不准 `isolation: 'worktree'`——隔离里的改动不会合回本分支，本流水线也没有选合步骤。
- 起 workflow 前确认干净、依赖已装。

## 只填 CONFIG

脚本用 `script` 内联传。**只改顶部 `CONFIG`**（路径、`commits`、`checks`、`review.rounds`、`doDrift` / `doScope`）。

禁止：

- 粘贴 briefing 原文（agent 自己 Read `CONFIG.briefingPath`）
- 改 `meta.phases` 或 `phase()` 字符串
- 删 `halt` 分支、把审查 round 默认改回 2（stage 默认就是 1；终审另起 review 模板并设 `rounds=2`）
- 把一个 stage 拆成「先实现、回头再决定审不审」两次调用——开发阶段用 `dev-stage-workflow.template.ts` 一次跑完

`agent()` 可能返回 `null`，模板已 `.filter(Boolean)`。`parallel` 是 barrier，失败项变 `null`。workflow 后台跑，完成时来通知；不要轮询。

本 skill 被调用即视为已授权使用 `Workflow`。

## 启动协议

| 时机 | 脚本 | CONFIG 要点 |
|------|------|-------------|
| unattended 的 design | `review-workflow.template.ts` | `rounds=1`，`seedLenses=roi`，`doDrift=false`，`doScope=false` |
| tech-design | 同上 | 中档 `rounds=1`；大档 `rounds=2` |
| 每个开发 stage | `dev-stage-workflow.template.ts` | `review.rounds=1`；小档 `doDrift=false` |
| 大档终审 | `review-workflow.template.ts` | `rounds=2`，diff 范围为 `workflow_base_sha..HEAD` |

返回值必读 `halt` / `converged`。`halt` 非空：停，按 `06-monitoring.md` 升级，禁止再派 fix。

`halt` 取值见 `05-review.md` 收敛节。

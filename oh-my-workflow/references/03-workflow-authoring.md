# worktree、一笔一 commit、workflow 模板

## worktree

所有 workflow 共用一个 worktree、一个分支。在用户指定的根目录下从最新 `origin/main` 建：

```bash
git fetch origin main
git worktree add -b <branch> <WORKTREE_ROOT>/<name> origin/main
```

分支名一次定好，写进 boot 与执行计划。

- **不要用 `git stash`**：stash 栈跨 worktree 共享。要暂存就打临时 WIP commit。
- 起 workflow 前确认干净、依赖已装。装依赖算中等风险，做了要说一声。
- 不要为审查另建 worktree / 分支，除非用户点名。

## 一笔一 commit

开发阶段默认**串行**。每一笔：

1. 实现 agent 只拿到这一笔：手书切片、允许路径、验收命令、runlog 绝对路径、`expected_base_sha`、`plan_item_id`。不要附整张 commit 表。
2. 先把 runlog 写成 `in-progress`，代码与 runlog 同一 commit，结束时报 HEAD。
3. 从 `expected_base_sha` 做出恰好一个新 commit。不要做下一笔，不要 push，不要开 PR。
4. 允许路径之外不要动。手书与代码现状冲突：`status=blocked-conflict`，不要 commit。
5. 非 `committed` 不得发下一笔。

并行只在编排者能证明**写入文件不重叠**时才用 `parallel`。有先后依赖（migration 再消费它、类型再实现）必须串。会并发写同一批文件：串行；`isolation: 'worktree'` 贵，且隔离里的改动不会自动合回来，仅在真会冲突且有明确选合步骤时用。

同一批对象走多道工序用 `pipeline`，无 barrier，比 `parallel` 两次更快。

## 填模板

脚本用 `script` 内联传，不要先 Write 到文件。返回结果里带持久化路径，要迭代就 Edit 那个文件再用 `scriptPath` 重跑。

1. 把 `04-agent-briefing.md` 的 BRIEFING 原文粘进 `BRIEFING`。不要摘要。
2. `meta.phases` 的 title 必须跟脚本里实际会走到的 `phase()` 完全一致。per-stage 审查 `ROUNDS = 1` 时删掉 Round 2 的 phase 条目。
3. `M` 与 SKILL.md 参数表一致。
4. `agent()` 可能返回 `null`（用户跳过 / 终端错误），用 `.filter(Boolean)`。`parallel` 是 barrier 且不 reject，失败项变 `null`。
5. workflow 在后台跑，调用立即返回 task id；完成时来通知。不要轮询、不要 sleep 等它。
6. 本 skill 被调用即视为已授权使用 `Workflow`。

开发模板：`assets/dev-stage-workflow.template.ts`（串行 COMMITS + Verify 最多 3 轮）。

审查模板：`assets/review-workflow.template.ts`。顶部常量：`ROUNDS`、`MAX_DIMS`、`DO_DRIFT`、`DO_SCOPE`、`DIFF_CMD`。

## 每个开发阶段的 Verify

阶段最后一个 phase 固定是 `Verify`：跑 typecheck / lint / test / 仓库自带 check。不绿就在同一个 workflow 内派 fix agent 修，最多 3 轮；3 轮还不绿，把失败原文原样返回。

用 schema 让 verify 返回结构化结果，主会话才能判定门禁。字段：`green`、`commands[].{cmd,ok,tail}`、`unresolved`。

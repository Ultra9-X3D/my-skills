# worktree 与 workflow 编写

## worktree

所有 workflow 共用一个 worktree、一个分支。

```bash
# 在主 checkout 里更新 base
git fetch origin main

# 在用户指定的 worktree 根目录下新建（示例路径按用户给的换）
git worktree add -b <branch> <WORKTREE_ROOT>/<name> origin/main
```

- 分支名一次定好，写进执行计划，之后所有 agent 都用它。
- **不要用 `git stash`**：stash 栈跨 worktree 共享，别的会话可能并发操作。要暂存改动就打临时 WIP commit。
- 起 workflow 前确认 worktree 干净、依赖已装（`bun install` 之类）。装依赖算中等风险，做了要说一声。

## workflow 脚本结构

一个开发阶段 = 一次 `Workflow` 调用。`meta.phases` 的 title 必须跟脚本里 `phase()` 的字符串完全一致。

模型统一：

```ts
const M = {model: 'opus', effort: 'xhigh'} as const
await agent(prompt, {...M, label: '…'})
```

### 阶段内怎么并行

- **文件不重叠** → `parallel([...])`，最快。
- **有先后依赖** → 直接 `await` 串下来。
- **同一批对象走多道工序** → `pipeline(items, stage1, stage2)`，无 barrier，比 `parallel` 两次更快。
- **会并发写同一批文件** → 要么串行，要么 `isolation: 'worktree'`（贵，最后一手）。

### 每个开发阶段必须自带收口

阶段最后一个 phase 固定是 `Verify`：跑 typecheck / lint / test / 仓库自带 check 脚本。**不绿就在同一个 workflow 内派 fix agent 修，最多 3 轮；3 轮还不绿，把失败原文原样返回，不要粉饰。**

用 `schema` 让 verify agent 返回结构化结果，主会话才能判定门禁：

```ts
const VERIFY_SCHEMA = {
  type: 'object',
  required: ['green', 'commands', 'unresolved'],
  properties: {
    green: {type: 'boolean'},
    commands: {type: 'array', items: {type: 'object', required: ['cmd', 'ok'], properties: {
      cmd: {type: 'string'}, ok: {type: 'boolean'}, tail: {type: 'string'},
    }}},
    unresolved: {type: 'array', items: {type: 'string'}},
  },
}
```

## review workflow：一次调用，2 轮

review 那一套 = **找 → 定级 → 修 → 复验**。开发阶段跑 1 轮，review workflow 跑 2 轮：第 2 轮在第 1 轮的修复产物上重跑全套，因为修复本身会引入新问题。

第 1 轮和第 2 轮的关注点不同：
- **轮 1**：正确性 bug、契约违背、缺失测试。宽口径地找。
- **轮 2**：在轮 1 修复之上重新找 bug，外加去重 / 简化 / 分层高度 / 死代码。此时才做质量清理，避免在还有 bug 的代码上白做。

每轮内部：
1. **Dimensions** — 一个 agent 读全量 diff，输出本轮要查的维度清单（不要写死维度，让它按 diff 实际形状定）。
2. **Find** — 每个维度一个 agent，`parallel`。只报有具体失效场景的问题。
3. **Verify** — 逐条对抗式复核：能构造出触发路径的标 CONFIRMED，说不清的丢弃。**宁缺勿滥。**
4. **Fix** — 按严重度排序修。修完提 commit。
5. **Gate** — 重跑全套 check。

## Workflow 调用要点

- 脚本用 `script` 内联传，不要先 Write 到文件。返回结果里带持久化路径，要迭代就 Edit 那个文件再用 `scriptPath` 重跑。
- `agent()` 可能返回 `null`（用户跳过 / 终端错误），用 `.filter(Boolean)`。
- `parallel` 是 barrier 且不 reject，失败项变 `null`。
- workflow 在后台跑，调用立即返回 task id；完成时来 `<task-notification>`。
- 只有用户明确要求过多 agent 编排才允许调 `Workflow`。本 skill 被调用即视为已授权。

模板见 `assets/dev-stage-workflow.template.ts` 与 `assets/review-workflow.template.ts`。

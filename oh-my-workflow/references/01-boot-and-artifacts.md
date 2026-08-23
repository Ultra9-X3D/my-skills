# boot、产物、续跑

产物根目录：worktree 内 `.ai_docs/<slug>/`。要求写进正文，不要在文首列「本文不包含什么」。

## slug

用分支名：小写、`/` → `-`、非 `[a-z0-9-]` 去掉，截到 40 字符。空则用需求短横线名。目录已存在且 boot 里的 `workflow_base_sha` 与当前任务不是同一回事：换后缀 `-2`，不要覆盖。

## `runlog/000-boot.md`

- `slug`、原始 branch、`attended|unattended`、档（含改档史）
- `repo`、`cwd`、`workflow_base_sha`（建 worktree 后 `git rev-parse HEAD`）
- `owned_workflows`：本 skill 起过的 workflow 名 / 返回的 task id，随开跑追加
- 模型 / effort（与 SKILL.md 参数表一致，除非用户改过）

## `design.md`

给人一行行读：

- **第一性**：用户要什么，为什么做。
- **生态位**：在产品里站哪；能做什么；**不做什么**。
- **生命周期与辐射**：经过哪些环节、碰到哪些模块。
- **抽象**：一个能记住的 how / why，不要停在功能清单。
- **后端影响**：新接口和契约；没有就写「无」和原因。
- **用户能感知到什么**：交互未定先写感知。可选一张仓库内单个 html，路径写进 design，等人打开；不起服务器。
- **竞品 / 现状**：做过就内联结论；没做就写未做。
- **阶段草案**：每段一行目标 + 范围。细节归 execution-plan。

## `tech-design.md`

给实现 agent。新 agent 只拿到这一份就能开工。

- 自包含：需要的决策抄进来，不写「见 design.md」。
- 关键路径贴亲手读过的现状代码，位置到文件，不贴行号（行号会漂）。
- 契约写成类型 / 函数签名 / 存储形状。
- 更新时直接写现在正确的方案，不要对照史。

小档没有这份文件，实现手书改用 `design.md`。

## `execution-plan.md`

骨架见 `assets/execution-plan.template.md`。写法和禁令见 `02-design-and-plan.md`。

进入 stage 时把当时 HEAD 记为 `stage_base_sha`；该 stage 计划中的 commit（含 fix）全部 `committed` 后记 `stage_head_sha`。写入 `runlog/s<NN>-status.md`。

## `runlog/`

文件名：`s<stage>-c<index>.md`（补零两位，如 `s01-c03.md`）。fix 用 `s01-c03-fix1.md`。drift 用 `drift-s01.md`。

每笔**开工先**写一份 `status: in-progress`，完成后改状态，再与代码同一 commit。不要把「本 commit 的 sha」写进将打进该 commit 的文件；恢复用 `git log -- <这份 runlog>`。

字段：

- `status`: `in-progress` | `committed` | `blocked-conflict` | `failed`
- `stage`、`commit_index`、`plan_item_id`、`expected_base_sha`
- `next`：下一笔 `plan_item_id` 或 `stage-review` / `done`
- 做了什么（文件级、可观察变化）
- 决策（与手书不一致处）
- 意外（超时、blocked、重试）
- `checks`：跑过的命令和结果
- follow-ups

`blocked-conflict` / `failed` 时禁止 `git commit`。

审查 diff 排除产物：

```bash
git diff <base> <head> -- . ':(exclude).ai_docs'
```

把这条命令和 sha 写进审查 prompt。drift 另读 `.ai_docs` 下本 stage 的文档。

走读报告的 URL 不准写入本目录（见 `07-e2e-and-pr.md`）。

## 续跑

读 `000-boot.md` 与 plan。核对 branch / HEAD / 脏工作区。用 `git log` 看哪些 runlog 已进 commit。从唯一的 `status: in-progress` 或最新 `next` 继续。已 committed 的步骤不重做。脏树不是本 pipeline 留下的 → 停下问用户。

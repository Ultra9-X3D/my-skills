# 审查与吸收

审查、吸收、越界核实必须是**新的** agent。不用实现进程，不用编排者上下文当独立视角。

编排者：核验审查文件是否按命名落盘，然后**只按吸收清单**改文档或调度 fix commit。不得自行增删清单条目。

## 文件名

`.ai_docs/<slug>/review/<phase>-<scope>-r<NN>-<lens>.md`

- `phase`：`design` | `td` | `s<n>` | `final`
- `scope`：`all` 或短模块名
- `r<NN>`：轮次，两位
- `lens`：`roi` | `arch` | `bug` | `drift` | `scope` | `abs`

每条 prompt 拿到互不相同的绝对路径。回复里只给这个路径。

## 场次

| 时机 | 跑什么 |
|------|--------|
| 意图阐明且 `unattended` | `roi` 1 份，再 `abs` |
| tech-design | 同上。大档 `r01` 再 `r02`；中档只 `r01` |
| 每个开发 stage 结束 | 1 轮：维度以 `arch` 与 `bug` 为种子（可按 diff 再加，总数 ≤ SKILL.md 的维度上限）→ find ∥ → 对抗 verify → `abs`。中/大再做 drift。然后越界检查 |
| 大档终审 | 上表代码审查 × 2，范围 `workflow_base_sha..HEAD`。第 1 轮门禁不绿，不开第 2 轮 |

第 1 轮关注正确性 bug、契约违背、缺失测试。第 2 轮在第 1 轮修复产物上重找 bug，外加去重 / 简化 / 分层 / 死代码；Fix 仍只许修 adopted，禁止顺手新行为。

开发 stage 的审查包在 `dev-stage-workflow.template.ts` 里，`rounds` 默认 1。design / tech-design / 终审用 `review-workflow.template.ts`；终审才把 `rounds` 设为 2。不要靠改 `meta.phases` 来切换轮次。

## 只读与写入口

dimensions / find / verify / absorb / drift / scope：**不改业务代码、不 git commit**。

代码修改的唯一入口：吸收清单里 `adopted` 的项，交给本 stage 实现 agent 打独立 fix commit + runlog。

文档修改（design / tech-design / plan）：编排者按清单直接写成现在正确的方案，不要留「曾经错误写法」对照段。

## 报告门槛

只报能写出具体失效场景的问题：什么输入 / 什么状态 → 什么错误结果。写不出触发路径的猜测不要报。风格偏好不要报。

对抗复核：能构造出触发路径的标 CONFIRMED，说不清的丢弃。宁缺勿滥。finding 超过 8 条就按块并行复核，不要塞进同一个 prompt。

不追求改完所有意见。`high` 必须修或在吸收清单里写明搁置理由；`low` 进 follow-ups。

修复若改了已审查的行为或契约：重跑受影响 lens。

## 收敛（脚本执行）

workflow 返回 `halt` 时编排器必须停，不准再派 fix、不准当没看见。

| 条件 | `halt` |
|------|--------|
| 某笔实现不是 `committed` | `implement-blocked` |
| Verify 3 轮仍不绿 | `verify-red` |
| 还要跑下一轮，但本轮门禁不绿 | `gate-red-no-next-round` |
| 第 n 轮（n≥2）confirmed 条数 ≥ max(上一轮 adopted 数, 1) | `finding-explosion` |

`finding-explosion` 表示补丁循环在放大问题（例如修 5 个后又冒出 13 个）。升级给人，改手书或拆 PR，不要自动再修一轮。

## 吸收

1. 原文齐了之后起**新** agent 跑判断吸收，输出采纳 / 搁置两列。不要先摘要再判断。
2. 采纳的文档修改由编排者按清单改；采纳的代码修改交给实现进程。
3. 你输出的是文档或代码现在应该长什么样，不是改叙事史。

## 漂移

读：design、本 stage 在 execution-plan 里的条目、`git diff`（排除 `.ai_docs`）、本 stage runlog、本 stage 的吸收文件。

核对：原始意图 — 计划承诺 — 可观察实现。有漂移：给出下一笔唯一纠正（改哪份文档或哪一个 `plan_item`）。没有：写「对准」+ 一句证据。

## 越界

每个开发 stage 结束后编排者看 `git diff --name-only <stage_base> <stage_head>`，对照手书辐射。越界 → 新 agent `scope` 透镜，只读该 diff 与 design/手书，不读实现进程的自我辩解。该改 / 不该改各列出来，依据写在手书里。

## 提示词块

拼 prompt 时第一段是 Read `BRIEFING.md`（见模板 `READ_BRIEFING`）。下面只补任务块。

**设计审查（roi）**

```
这是实习生出的设计方案，请严格审核。
看：ROI 是否够高、设计是否合理、有没有无意义冗余、有没有漏掉真实代码约束。
每条意见必须能指向文档小节，并尽量用你读过的代码路径当证据。只对未来有意义的 hardening 标 follow-up，不当当前缺陷。
不要改业务代码。完整意见写到指定 markdown 路径，回复里只给这个路径。
```

**判断吸收**

```
下面是审查意见原文（不要先摘要再判断）。
逐条说人话：这条在说什么、该不该改、怎么改。
区分：对当前内部 MVP 真有帮助的；过度设计 / 纯边界 / 提前防御，可以搁置。
输出两列：采纳（含改法）、搁置（含一句理由）。
写到指定路径，回复里只给路径。不要改业务代码。
```

**架构审查**

```
只做架构审查。对照手书与 git diff 范围：分层是否还成立、契约有没有悄悄变、有没有把手书辐射外的公共层改掉、有没有引入手书没有的子系统。
每条给文件/模块级位置和可观察后果。只写指定 markdown，不改业务代码，回复只报路径。
```

**bug 审查**

```
优先顺序：手书/验收里的用户行为有没有做对 → 实际调用链和状态转换 → 现有测试或契约有没有被破坏 → 最后才是权限、并发、生命周期。
每条 finding 给当前代码路径，以及可复现行为或现有契约证据。拿不准的标 follow-up。不要为了好看发明防御代码。
只写指定 markdown，不改业务代码，回复只报路径。
```

**漂移校正** / **越界核实**：任务块见上两节，写到指定路径，不改业务代码。

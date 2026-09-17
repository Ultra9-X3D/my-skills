# my-skills

Custom agent skills for Claude Code / Codex.

## Skills

| Skill | Description |
| --- | --- |
| [weekly-publicity-roster](./weekly-publicity-roster/SKILL.md) | 根据当周课表与报名自动安排宣传值班，核验课程冲突、人数与待确认时段，并生成飞书课程式总览、个人安排和可视化看板。 |
| [clean-correction](./clean-correction/SKILL.md) | 在用户否定或更换方案后落实最终意图，清除旧方案的代码、测试、文档与辩护式注释残留，同时保留必要的安全与正确性提醒。 |
| [oh-my-workflow](./oh-my-workflow/SKILL.md) | Claude Code Workflow pipeline: boot + size tier → human design / agent tech-design → serial commits with runlogs → absorb-only review → E2E → pr-walkthrough → a single PR (the PR body must not include the walkthrough report URL). |
| [pr-walkthrough](./pr-walkthrough/SKILL.md) | Deep PR / branch walkthrough. Fully read the diff, then write a Feishu document (journey narrative + whiteboard diagrams + real code snippets + investigation waypoints). Understanding only, not code review. Hard-depends on `lark-cli` and the `lark-doc` / `lark-whiteboard` skills. Sourced from [figuretu/my-skills](https://github.com/figuretu/my-skills/tree/master/pr-walkthrough). |

## Layout

Each skill lives in its own directory with a `SKILL.md` at the root, plus optional `agents/`, `references/`, and `assets/`.
## 宣传活动自动排班

把 `weekly-publicity-roster` 目录安装到 Codex 的 `$CODEX_HOME/skills/`（默认 `~/.codex/skills/`）。上传带姓名的当周课表后输入：

> 请用 $weekly-publicity-roster 安排本周宣传值班，并生成飞书课程式值班表和可视化看板。

默认深入宣传为 10:00—12:00、15:00—17:00，每组 3 人、每时段 1—2 组；棚子宣传为 11:00—13:00、17:00—19:00、19:00—21:00，每班至少 2 人。按周重新核验课表，报名时段不能完整覆盖时标记待本人确认。

排班与校验脚本仅依赖 Python 3.9+ 标准库。飞书发布需要可用的 `lark-base` 技能和已授权工具；缺少连接时先交付本地方案。技能包仅含通用规则与虚构测试数据。

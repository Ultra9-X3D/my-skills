# my-skills

Custom agent skills for Claude Code / Codex.

## Skills

| Skill | Description |
| --- | --- |
| [oh-my-workflow](./oh-my-workflow/SKILL.md) | Claude Code Workflow pipeline: boot + size tier → human design / agent tech-design → serial commits with runlogs → absorb-only review → E2E → pr-walkthrough → a single PR (the PR body must not include the walkthrough report URL). |
| [pr-walkthrough](./pr-walkthrough/SKILL.md) | Deep PR / branch walkthrough. Fully read the diff, then write a Feishu document (journey narrative + whiteboard diagrams + real code snippets + investigation waypoints). Understanding only, not code review. Hard-depends on `lark-cli` and the `lark-doc` / `lark-whiteboard` skills. Sourced from [figuretu/my-skills](https://github.com/figuretu/my-skills/tree/master/pr-walkthrough). |

## Layout

Each skill lives in its own directory with a `SKILL.md` at the root, plus optional `references/` and `assets/`.

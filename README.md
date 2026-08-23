# my-skills

Custom agent skills for Claude Code / Codex.

## Skills

| Skill | Description |
| --- | --- |
| [oh-my-workflow](./oh-my-workflow/SKILL.md) | Turn a large feature request into a fixed pipeline: stage split → user approval → self-contained plan → one worktree → one dev workflow per stage (1 round) → one review workflow (2 rounds) → unattended monitoring → agent-browser E2E → a single PR. |
| [pr-walkthrough](./pr-walkthrough/SKILL.md) | Deep PR / branch walkthrough. Fully read the diff, then write a Feishu document (journey narrative + whiteboard diagrams + real code snippets + investigation waypoints). Understanding only, not code review. Hard-depends on `lark-cli` and the `lark-doc` / `lark-whiteboard` skills. Sourced from [figuretu/my-skills](https://github.com/figuretu/my-skills/tree/master/pr-walkthrough). |

## Layout

Each skill lives in its own directory with a `SKILL.md` at the root, plus optional `references/` and `assets/`.

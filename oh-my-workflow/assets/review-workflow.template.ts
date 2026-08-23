export const meta = {
  name: 'review-<stage-or-final>',
  description: '只读审查 → 吸收清单 → 实现 agent 按清单修 → 门禁',
  phases: [
    {title: 'Round 1 · Dimensions', detail: '读 diff，定本轮维度', model: 'opus'},
    {title: 'Round 1 · Find', detail: '每维度一个 agent 并行找问题', model: 'opus'},
    {title: 'Round 1 · Verify', detail: '对抗式复核，宁缺勿滥', model: 'opus'},
    {title: 'Round 1 · Absorb', detail: '采纳 / 搁置两列', model: 'opus'},
    {title: 'Round 1 · Fix', detail: '只修 adopted + 门禁', model: 'opus'},
    {title: 'Round 2 · Dimensions', detail: '在修复产物上重定维度', model: 'opus'},
    {title: 'Round 2 · Find', detail: 'bug + 去重/简化/分层', model: 'opus'},
    {title: 'Round 2 · Verify', detail: '对抗式复核', model: 'opus'},
    {title: 'Round 2 · Absorb', detail: '采纳 / 搁置两列', model: 'opus'},
    {title: 'Round 2 · Fix', detail: '修 + 最终门禁', model: 'opus'},
    {title: 'Drift', detail: '意图-计划-实现是否对准', model: 'opus'},
    {title: 'Scope', detail: '越界核实', model: 'opus'},
  ],
}

const M = {model: 'opus', effort: 'xhigh'} as const

// 从 references/04-agent-briefing.md 粘贴 BRIEFING 原文。不要摘要。
const BRIEFING = `PASTE_BRIEFING_FROM_references/04-agent-briefing.md`

// per-stage：ROUNDS=1，小档 DO_DRIFT=false；终审：ROUNDS=2。meta.phases 与实际 phase() 对齐。
const ROUNDS = 2
const MAX_DIMS = 6
const DO_DRIFT = true
const DO_SCOPE = true
const DIFF_CMD = 'git diff <base> HEAD -- . \':(exclude).ai_docs\''
const CHECKS = `<仓库自带 check 命令清单>`
const REVIEW_DIR = '<.ai_docs/<slug>/review/ 绝对路径>'
const HANDBOOK = '<手书绝对路径>'
const SEED_LENSES = 'arch, bug'

const NO_CODE = `【不要做】
不要改业务代码。不要 git commit。不要 push。完整意见写到指定 markdown 路径，回复里只给这个路径。`

const DIM_SCHEMA = {
  type: 'object',
  required: ['dimensions'],
  properties: {
    dimensions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'scope', 'why'],
        properties: {name: {type: 'string'}, scope: {type: 'string'}, why: {type: 'string'}},
      },
    },
  },
}

const FIND_SCHEMA = {
  type: 'object',
  required: ['path'],
  properties: {path: {type: 'string'}, count: {type: 'number'}},
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['confirmed'],
  properties: {
    confirmed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'summary', 'failure_scenario', 'severity'],
        properties: {
          file: {type: 'string'},
          summary: {type: 'string'},
          failure_scenario: {type: 'string'},
          severity: {type: 'string', enum: ['high', 'medium', 'low']},
        },
      },
    },
    discarded: {type: 'array', items: {type: 'string'}},
  },
}

const ABSORB_SCHEMA = {
  type: 'object',
  required: ['path', 'adopted', 'deferred'],
  properties: {
    path: {type: 'string'},
    adopted: {
      type: 'array',
      items: {
        type: 'object',
        required: ['summary', 'how'],
        properties: {summary: {type: 'string'}, how: {type: 'string'}, file: {type: 'string'}},
      },
    },
    deferred: {
      type: 'array',
      items: {
        type: 'object',
        required: ['summary', 'why'],
        properties: {summary: {type: 'string'}, why: {type: 'string'}},
      },
    },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  required: ['green', 'commands', 'unresolved'],
  properties: {
    green: {type: 'boolean'},
    commands: {
      type: 'array',
      items: {
        type: 'object',
        required: ['cmd', 'ok'],
        properties: {cmd: {type: 'string'}, ok: {type: 'boolean'}, tail: {type: 'string'}},
      },
    },
    unresolved: {type: 'array', items: {type: 'string'}},
  },
}

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function round(n: number) {
  const focus =
    n === 1
      ? '正确性 bug、契约违背、缺失或过弱的测试。宽口径地找，先不做质量清理。种子透镜：' + SEED_LENSES
      : '在上一轮修复之上重新找 bug（修复本身会引入新问题），外加去重、简化、分层高度、死代码。'

  phase(`Round ${n} · Dimensions`)
  const dimsRes = await agent(
    `${BRIEFING}

【你的任务】
跑 \`${DIFF_CMD}\` 读改动，定出本轮要查的维度清单。
先纳入种子透镜（${SEED_LENSES}），再按 diff 实际形状最多补到 ${MAX_DIMS} 个。不要超过 ${MAX_DIMS}。
每个维度给出 name / scope（具体文件或目录）/ why。

【本轮关注】
${focus}

【返回】
只返回结构化维度清单。`,
    {...M, label: `dims-r${n}`, phase: `Round ${n} · Dimensions`, schema: DIM_SCHEMA},
  )

  const raw = dimsRes?.dimensions ?? []
  const dims = raw.slice(0, MAX_DIMS)
  if (raw.length > MAX_DIMS) log(`维度截断 ${raw.length} → ${MAX_DIMS}`)

  phase(`Round ${n} · Find`)
  const findFiles = (
    await parallel(
      dims.map(
        (d: any) => () =>
          agent(
            `${BRIEFING}

【你的任务】
在维度「${d.name}」上审查。范围：${d.scope}。为什么查：${d.why}
跑 \`${DIFF_CMD}\`。对照手书 ${HANDBOOK}。

【本轮关注】
${focus}

【报告门槛】
只报你能写出具体失效场景的问题。写不出触发路径的猜测不要报。风格偏好不要报。
完整意见写到 ${REVIEW_DIR}/<phase>-<scope>-r${String(n).padStart(2, '0')}-${d.name}.md

${NO_CODE}

【返回】
只返回 {path, count}。`,
            {...M, label: `find-${d.name}`, phase: `Round ${n} · Find`, schema: FIND_SCHEMA},
          ),
      ),
    )
  ).filter(Boolean)

  log(`第 ${n} 轮 find 文件 ${findFiles.length} 份`)

  phase(`Round ${n} · Verify`)
  const findChunks = chunk(findFiles, 4)
  const verifiedParts = (
    await parallel(
      findChunks.map(
        (part: any, i: number) => () =>
          agent(
            `${BRIEFING}

【你的任务】
先读下面这些审查文件，再对抗式复核每一条 finding。读实际代码，尝试构造真实触发路径。
能构造出来的保留；构造不出、或前提在本代码库里不可能成立的，丢弃并说明原因。
宁缺勿滥。

【待复核的文件】
${JSON.stringify(part, null, 2)}

【返回】
只返回结构化结果：confirmed（按严重度降序）+ discarded。`,
            {...M, label: `verify-r${n}-${i}`, phase: `Round ${n} · Verify`, schema: VERIFY_SCHEMA},
          ),
      ),
    )
  ).filter(Boolean)

  const confirmed = verifiedParts.flatMap((r: any) => r.confirmed ?? [])
  log(`第 ${n} 轮确认 ${confirmed.length} 条`)

  phase(`Round ${n} · Absorb`)
  const absorbed = await agent(
    `${BRIEFING}

【你的任务】
下面是已确认 finding 原文（不要先摘要再判断）。逐条说该不该改、怎么改。
high 必须采纳或写明搁置理由；low 默认搁置进 follow-ups。
输出两列：采纳（含改法）、搁置（含一句理由）。
写到 ${REVIEW_DIR}/<phase>-all-r${String(n).padStart(2, '0')}-abs.md

${NO_CODE}

【confirmed】
${JSON.stringify(confirmed, null, 2)}`,
    {...M, label: `abs-r${n}`, phase: `Round ${n} · Absorb`, schema: ABSORB_SCHEMA},
  )

  const adopted = absorbed?.adopted ?? []
  phase(`Round ${n} · Fix`)
  let gate: any = {green: true, commands: [], unresolved: []}
  if (adopted.length > 0) {
    gate = await agent(
      `${BRIEFING}

【你的任务】
只修吸收清单里 adopted 的项，按严重度降序。每组相关修复打独立 fix commit，并写 runlog。
然后跑门禁到全绿。

${JSON.stringify(adopted, null, 2)}

【门禁】
${CHECKS}

【不要做】
不要顺手做清单外的改动。不要为了让测试通过而弱化断言。不要给吸收清单加条目。

【提交】
在当前分支上提交，commit message 用 \`fix(scope): subject\` 或 \`refactor(scope): subject\`。
不要创建分支，不要 push，不要开 PR。

【返回】
只返回结构化门禁结果。`,
      {...M, label: `fix-r${n}`, phase: `Round ${n} · Fix`, schema: GATE_SCHEMA},
    )
  } else {
    gate = await agent(
      `${BRIEFING}

【你的任务】
本轮 adopted 为空。只跑门禁，不改业务代码。

${CHECKS}

【返回】
只返回结构化门禁结果。`,
      {...M, label: `gate-r${n}`, phase: `Round ${n} · Fix`, schema: GATE_SCHEMA},
    )
  }

  return {round: n, confirmed, absorbed, gate}
}

const r1 = await round(1)
let r2out = null
if (ROUNDS >= 2 && r1.gate?.green) {
  r2out = await round(2)
} else if (ROUNDS >= 2) {
  log('第 1 轮门禁未绿，跳过第 2 轮')
}

let drift = null
if (DO_DRIFT) {
  phase('Drift')
  drift = await agent(
    `${BRIEFING}

【你的任务】
读手书 ${HANDBOOK}、本 stage 计划条目、\`${DIFF_CMD}\`、本 stage runlog 与吸收文件。
核对：原始意图 — 计划承诺 — 可观察实现。是否对准、是否原地打转、主线有没有被带跑。
有漂移：给出下一笔唯一纠正。没有：写「对准」+ 一句证据。
写到 ${REVIEW_DIR}/<phase>-all-r01-drift.md

${NO_CODE}`,
    {...M, label: 'drift', phase: 'Drift'},
  )
}

let scope = null
if (DO_SCOPE) {
  phase('Scope')
  scope = await agent(
    `${BRIEFING}

【你的任务】
跑 git diff --name-only <stage_base> <stage_head>。只读该文件清单和手书 ${HANDBOOK}。
判断这些路径是否在辐射内。该改 / 不该改各列出来，依据写在手书里，不听实现进程解释。
写到 ${REVIEW_DIR}/<phase>-all-r01-scope.md

${NO_CODE}`,
    {...M, label: 'scope', phase: 'Scope'},
  )
}

return {r1, r2: r2out, drift, scope}

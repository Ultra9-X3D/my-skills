export const meta = {
  name: 'review-<stage-or-final>',
  description: '只读审查 → 吸收清单 → 实现 agent 按清单修 → 收敛判定',
  phases: [
    {title: 'Review', detail: '定维度 / 找 / 对抗复核', model: 'opus'},
    {title: 'Absorb', detail: '采纳 / 搁置两列', model: 'opus'},
    {title: 'Fix', detail: '只修 adopted + 门禁', model: 'opus'},
    {title: 'Drift', detail: '意图-计划-实现是否对准', model: 'opus'},
    {title: 'Scope', detail: '越界核实', model: 'opus'},
    {title: 'Converge', detail: 'halt 判定，编排器不得忽略', model: 'opus'},
  ],
}

const M = {model: 'opus', effort: 'xhigh'} as const

const CONFIG = {
  briefingPath: '<.ai_docs/<slug>/BRIEFING.md 绝对路径>',
  handbookPath: '<手书绝对路径>',
  checks: '<仓库自带 check 命令清单>',
  rounds: 1,
  maxDims: 6,
  doDrift: true,
  doScope: true,
  diffCmd: "git diff <base> HEAD -- . ':(exclude).ai_docs'",
  reviewDir: '<.ai_docs/<slug>/review/ 绝对路径>',
  seedLenses: 'arch, bug',
  phaseTag: 's1',
}

const READ_BRIEFING = `【必做第一件事】
Read ${CONFIG.briefingPath}。遵守其中 BRIEFING 原文，不摘要、不改写。读完再做下面的任务。`

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

function pad2(n) {
  return n < 10 ? `0${n}` : String(n)
}

async function round(n) {
  const focus =
    n === 1
      ? '正确性 bug、契约违背、缺失或过弱的测试。宽口径地找，先不做质量清理。种子透镜：' + CONFIG.seedLenses
      : '在上一轮修复之上重新找 bug。第 2 轮可以报去重 / 简化 / 分层 / 死代码，但 Fix 仍只许修 adopted，禁止顺手新行为。'

  phase('Review')
  const dimsRes = await agent(
    `${READ_BRIEFING}

【你的任务】
跑 \`${CONFIG.diffCmd}\` 读改动，定出本轮要查的维度清单。
先纳入种子透镜（${CONFIG.seedLenses}），再按 diff 实际形状最多补到 ${CONFIG.maxDims} 个。
每个维度给出 name / scope / why。

【本轮关注】
${focus}

【返回】
只返回结构化维度清单。`,
    {...M, label: `dims-r${n}`, phase: 'Review', schema: DIM_SCHEMA},
  )

  const raw = dimsRes?.dimensions ?? []
  const dims = raw.slice(0, CONFIG.maxDims)
  if (raw.length > CONFIG.maxDims) log(`维度截断 ${raw.length} → ${CONFIG.maxDims}`)

  const findFiles = (
    await parallel(
      dims.map(
        (d) => () =>
          agent(
            `${READ_BRIEFING}

【你的任务】
在维度「${d.name}」上审查。范围：${d.scope}。为什么查：${d.why}
跑 \`${CONFIG.diffCmd}\`。对照手书 ${CONFIG.handbookPath}。

【本轮关注】
${focus}

【报告门槛】
只报你能写出具体失效场景的问题。写不出触发路径的猜测不要报。风格偏好不要报。
完整意见写到 ${CONFIG.reviewDir}/${CONFIG.phaseTag}-all-r${pad2(n)}-${d.name}.md

${NO_CODE}

【返回】
只返回 {path, count}。`,
            {...M, label: `find-${d.name}`, phase: 'Review', schema: FIND_SCHEMA},
          ),
      ),
    )
  ).filter(Boolean)

  log(`第 ${n} 轮 find 文件 ${findFiles.length} 份`)

  const verifiedParts = (
    await parallel(
      chunk(findFiles, 4).map(
        (part, i) => () =>
          agent(
            `${READ_BRIEFING}

【你的任务】
先读下面这些审查文件，再对抗式复核每一条 finding。读实际代码，尝试构造真实触发路径。
能构造出来的保留；构造不出的丢弃。宁缺勿滥。

【待复核的文件】
${JSON.stringify(part, null, 2)}

【返回】
只返回 confirmed + discarded。`,
            {...M, label: `verify-r${n}-${i}`, phase: 'Review', schema: VERIFY_SCHEMA},
          ),
      ),
    )
  ).filter(Boolean)

  const confirmed = verifiedParts.flatMap((r) => r.confirmed ?? [])
  log(`第 ${n} 轮确认 ${confirmed.length} 条`)

  phase('Absorb')
  const absorbed = await agent(
    `${READ_BRIEFING}

【你的任务】
下面是已确认 finding 原文（不要先摘要再判断）。逐条说该不该改、怎么改。
high 必须采纳或写明搁置理由；low 默认搁置进 follow-ups。
输出两列：采纳（含改法）、搁置（含一句理由）。
写到 ${CONFIG.reviewDir}/${CONFIG.phaseTag}-all-r${pad2(n)}-abs.md

${NO_CODE}

【confirmed】
${JSON.stringify(confirmed, null, 2)}`,
    {...M, label: `abs-r${n}`, phase: 'Absorb', schema: ABSORB_SCHEMA},
  )

  const adopted = absorbed?.adopted ?? []
  phase('Fix')
  const gate = await agent(
    adopted.length > 0
      ? `${READ_BRIEFING}

【你的任务】
只修吸收清单里 adopted 的项。每组相关修复打独立 fix commit，并写 runlog。然后跑门禁到全绿。
不要顺手做清单外的改动。不要为了让测试通过而弱化断言。不要给吸收清单加条目。不要引入新行为。

${JSON.stringify(adopted, null, 2)}

【门禁】
${CONFIG.checks}

【提交】
commit message 用 \`fix(scope): subject\` 或 \`refactor(scope): subject\`。不要创建分支，不要 push，不要开 PR。

【返回】
只返回结构化门禁结果。`
      : `${READ_BRIEFING}

【你的任务】
本轮 adopted 为空。只跑门禁，不改业务代码。

${CONFIG.checks}

【返回】
只返回结构化门禁结果。`,
    {...M, label: adopted.length > 0 ? `fix-r${n}` : `gate-r${n}`, phase: 'Fix', schema: GATE_SCHEMA},
  )

  return {round: n, confirmed, adoptedCount: adopted.length, absorbed, gate}
}

const roundsOut = []
let halt = null
let prevAdopted = 0

for (let n = 1; n <= CONFIG.rounds; n++) {
  if (halt) break
  const r = await round(n)
  roundsOut.push(r)
  if (!r.gate?.green) {
    halt = n < CONFIG.rounds ? 'gate-red-no-next-round' : 'verify-red'
    log(`halt=${halt} round=${n}`)
    break
  }
  if (n >= 2 && r.confirmed.length >= Math.max(prevAdopted, 1)) {
    halt = 'finding-explosion'
    log(`halt=finding-explosion confirmed=${r.confirmed.length} prevAdopted=${prevAdopted}`)
    break
  }
  prevAdopted = r.adoptedCount
}

phase('Drift')
let drift = null
if (CONFIG.doDrift) {
  drift = await agent(
    `${READ_BRIEFING}

【你的任务】
读手书 ${CONFIG.handbookPath}、本 stage 计划条目、\`${CONFIG.diffCmd}\`、本 stage runlog 与吸收文件。
核对：原始意图 — 计划承诺 — 可观察实现。有漂移：给出下一笔唯一纠正。没有：写「对准」+ 一句证据。
写到 ${CONFIG.reviewDir}/${CONFIG.phaseTag}-all-r01-drift.md

${NO_CODE}`,
    {...M, label: 'drift', phase: 'Drift'},
  )
} else {
  log('Drift skipped')
}

phase('Scope')
let scope = null
if (CONFIG.doScope) {
  scope = await agent(
    `${READ_BRIEFING}

【你的任务】
跑 git diff --name-only <stage_base> <stage_head>。只读该文件清单和手书 ${CONFIG.handbookPath}。
判断这些路径是否在辐射内。该改 / 不该改各列出来，依据写在手书里，不听实现进程解释。
写到 ${CONFIG.reviewDir}/${CONFIG.phaseTag}-all-r01-scope.md

${NO_CODE}`,
    {...M, label: 'scope', phase: 'Scope'},
  )
} else {
  log('Scope skipped')
}

phase('Converge')
log(`converge halt=${halt ?? 'none'}`)

return {halt, converged: halt == null, rounds: roundsOut, drift, scope}

export const meta = {
  name: 'stage-N-<slug>',
  description: '<阶段目标一句话>',
  phases: [
    {title: 'Implement', detail: '一笔一个 commit，串行', model: 'opus'},
    {title: 'Verify', detail: 'typecheck / lint / test / repo checks', model: 'opus'},
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
  handbookPath: '<tech-design.md 或小档的 design.md 绝对路径>',
  checks: '<仓库自带 check 命令清单>',
  commits: [
    {
      id: 'sN-c1',
      expected_base_sha: '<sha>',
      allowed_paths: '<逗号分隔路径>',
      runlog: '<.ai_docs/<slug>/runlog/s0N-c01.md 绝对路径>',
      task: '…',
    },
  ],
  review: {
    rounds: 1,
    maxDims: 6,
    doDrift: true,
    doScope: true,
    diffCmd: "git diff <stage_base> HEAD -- . ':(exclude).ai_docs'",
    reviewDir: '<.ai_docs/<slug>/review/ 绝对路径>',
    seedLenses: 'arch, bug',
    phaseTag: 'sN',
  },
}

const READ_BRIEFING = `【必做第一件事】
Read ${CONFIG.briefingPath}。遵守其中 BRIEFING 原文，不摘要、不改写。读完再做下面的任务。`

const COMMIT_RULES = `【提交】
从 expected_base_sha 做出恰好一个新 commit，代码与 runlog 同一 commit。
commit message 用 \`type(scope): subject\`。测试与被测代码放同一个 commit。
不要做下一笔，不要创建分支，不要 push，不要开 PR。`

const NO_CODE = `【不要做】
不要改业务代码。不要 git commit。不要 push。完整意见写到指定 markdown 路径，回复里只给这个路径。`

const IMPLEMENT_SCHEMA = {
  type: 'object',
  required: ['status', 'head_sha', 'files', 'unresolved'],
  properties: {
    status: {type: 'string', enum: ['committed', 'blocked-conflict', 'failed']},
    head_sha: {type: 'string'},
    subject: {type: 'string'},
    files: {type: 'array', items: {type: 'string'}},
    unresolved: {type: 'array', items: {type: 'string'}},
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

const FINDINGS_SCHEMA = {
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

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n)
}

const done = []
let head = CONFIG.commits[0].expected_base_sha
let halt = null

phase('Implement')
for (const c of CONFIG.commits) {
  if (halt) break
  const result = await agent(
    `${READ_BRIEFING}

【你的任务】
只做 plan_item_id=${c.id} 这一笔。手书是 ${CONFIG.handbookPath} 里与本笔相关的切片，按它写。
${c.task}

【约束】
expected_base_sha=${c.expected_base_sha}
允许改的路径：${c.allowed_paths}。除此之外不要动。
runlog 绝对路径：${c.runlog}
先把 runlog 写成 in-progress，完成后再改 status，与代码同一 commit。结束时报 HEAD。
不要把本 commit 的 sha 写进 runlog。

【完成判据】
${CONFIG.checks}

${COMMIT_RULES}

【返回】
只返回结构化结果。`,
    {...M, label: c.id, phase: 'Implement', schema: IMPLEMENT_SCHEMA},
  )
  done.push(result)
  if (!result || result.status !== 'committed') {
    halt = 'implement-blocked'
    log(`halt=implement-blocked id=${c.id} status=${result?.status ?? 'null'}`)
    break
  }
  head = result.head_sha
  log(`${c.id} committed @ ${head}`)
}

if (halt) {
  phase('Verify')
  phase('Review')
  phase('Absorb')
  phase('Fix')
  phase('Drift')
  phase('Scope')
  phase('Converge')
  log(`converge halt=${halt}`)
  return {halt, converged: false, implemented: done, head}
}

phase('Verify')
let verdict = null
for (let round = 1; round <= 3; round++) {
  verdict = await agent(
    `${READ_BRIEFING}

【你的任务】
跑下面的门禁命令，把失败全部修掉，然后重跑到全绿。修的内容打独立 fix commit，并写 runlog。

${CONFIG.checks}

【上游实现】
${JSON.stringify(done, null, 2)}

【不要做】
不要为了让测试通过而弱化断言或跳过测试。不要改测试去迁就实现，除非测试本身写错了。
不要做吸收清单以外的重构。

${COMMIT_RULES}

【返回】
只返回结构化结果。`,
    {...M, label: `verify-r${round}`, phase: 'Verify', schema: GATE_SCHEMA},
  )
  if (verdict?.green) break
  log(`门禁第 ${round} 轮未通过：${(verdict?.unresolved ?? []).join('; ')}`)
}

if (!verdict?.green) {
  halt = 'verify-red'
  phase('Review')
  phase('Absorb')
  phase('Fix')
  phase('Drift')
  phase('Scope')
  phase('Converge')
  log(`converge halt=${halt}`)
  return {halt, converged: false, verdict, implemented: done, head}
}

async function reviewRound(n) {
  const R = CONFIG.review
  const focus =
    n === 1
      ? '正确性 bug、契约违背、缺失或过弱的测试。种子透镜：' + R.seedLenses
      : '在上一轮修复之上重新找 bug。Fix 仍只许修 adopted，禁止顺手新行为。'

  phase('Review')
  const dimsRes = await agent(
    `${READ_BRIEFING}

【你的任务】
跑 \`${R.diffCmd}\` 读改动，定维度。先纳入 ${R.seedLenses}，最多 ${R.maxDims} 个。

【本轮关注】
${focus}

【返回】
只返回结构化维度清单。`,
    {...M, label: `dims-r${n}`, phase: 'Review', schema: DIM_SCHEMA},
  )
  const raw = dimsRes?.dimensions ?? []
  const dims = raw.slice(0, R.maxDims)
  if (raw.length > R.maxDims) log(`维度截断 ${raw.length} → ${R.maxDims}`)

  const findFiles = (
    await parallel(
      dims.map(
        (d) => () =>
          agent(
            `${READ_BRIEFING}

【你的任务】
在维度「${d.name}」上审查。范围：${d.scope}。跑 \`${R.diffCmd}\`。对照 ${CONFIG.handbookPath}。
只报能写出失效场景的问题。写到 ${R.reviewDir}/${R.phaseTag}-all-r${pad2(n)}-${d.name}.md
${NO_CODE}
【返回】只返回 {path, count}。`,
            {...M, label: `find-${d.name}`, phase: 'Review', schema: FIND_SCHEMA},
          ),
      ),
    )
  ).filter(Boolean)

  const verifiedParts = (
    await parallel(
      chunk(findFiles, 4).map(
        (part, i) => () =>
          agent(
            `${READ_BRIEFING}

【你的任务】
先读这些审查文件，对抗复核。能构造触发路径的保留。宁缺勿滥。
${JSON.stringify(part, null, 2)}
【返回】confirmed + discarded。`,
            {...M, label: `verify-r${n}-${i}`, phase: 'Review', schema: FINDINGS_SCHEMA},
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
对 confirmed 原文判断吸收。high 必须采纳或写明搁置。写到 ${R.reviewDir}/${R.phaseTag}-all-r${pad2(n)}-abs.md
${NO_CODE}
${JSON.stringify(confirmed, null, 2)}`,
    {...M, label: `abs-r${n}`, phase: 'Absorb', schema: ABSORB_SCHEMA},
  )
  const adopted = absorbed?.adopted ?? []

  phase('Fix')
  const gate = await agent(
    adopted.length > 0
      ? `${READ_BRIEFING}

【你的任务】
只修 adopted。独立 fix commit + runlog。跑门禁。不要清单外改动，不要弱化断言，不要新行为。
${JSON.stringify(adopted, null, 2)}
【门禁】
${CONFIG.checks}
${COMMIT_RULES}`
      : `${READ_BRIEFING}

【你的任务】adopted 为空。只跑门禁，不改业务代码。
${CONFIG.checks}`,
    {...M, label: adopted.length > 0 ? `fix-r${n}` : `gate-r${n}`, phase: 'Fix', schema: GATE_SCHEMA},
  )

  return {round: n, confirmed, adoptedCount: adopted.length, absorbed, gate}
}

const roundsOut = []
let prevAdopted = 0
for (let n = 1; n <= CONFIG.review.rounds; n++) {
  const r = await reviewRound(n)
  roundsOut.push(r)
  if (!r.gate?.green) {
    halt = n < CONFIG.review.rounds ? 'gate-red-no-next-round' : 'verify-red'
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
if (!halt && CONFIG.review.doDrift) {
  drift = await agent(
    `${READ_BRIEFING}

【你的任务】
读 ${CONFIG.handbookPath}、计划条目、\`${CONFIG.review.diffCmd}\`、runlog、吸收文件。
核对意图—计划—实现。有漂移给下一笔唯一纠正。写到 ${CONFIG.review.reviewDir}/${CONFIG.review.phaseTag}-all-r01-drift.md
${NO_CODE}`,
    {...M, label: 'drift', phase: 'Drift'},
  )
} else {
  log(halt ? 'Drift skipped due to halt' : 'Drift skipped')
}

phase('Scope')
let scope = null
if (!halt && CONFIG.review.doScope) {
  scope = await agent(
    `${READ_BRIEFING}

【你的任务】
git diff --name-only <stage_base> <stage_head>。对照手书辐射。不听实现进程解释。
写到 ${CONFIG.review.reviewDir}/${CONFIG.review.phaseTag}-all-r01-scope.md
${NO_CODE}`,
    {...M, label: 'scope', phase: 'Scope'},
  )
} else {
  log(halt ? 'Scope skipped due to halt' : 'Scope skipped')
}

phase('Converge')
log(`converge halt=${halt ?? 'none'}`)

return {
  halt,
  converged: halt == null,
  head,
  verdict,
  implemented: done.length,
  rounds: roundsOut,
  drift,
  scope,
}

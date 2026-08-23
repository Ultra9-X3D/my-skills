// 按 COMMITS 为每一笔加一条 Implement phase，title 与 phase(`Implement ${c.id}`) 一致
export const meta = {
  name: 'stage-N-<slug>',
  description: '<阶段目标一句话>',
  phases: [
    {title: 'Implement sN-c1', detail: '一笔一个 commit', model: 'opus'},
    {title: 'Verify', detail: 'typecheck / lint / test / repo checks', model: 'opus'},
  ],
}

const M = {model: 'opus', effort: 'xhigh'} as const

// 从 references/04-agent-briefing.md 粘贴 BRIEFING 原文。不要摘要。
const BRIEFING = `PASTE_BRIEFING_FROM_references/04-agent-briefing.md`

const COMMIT_RULES = `【提交】
从 expected_base_sha 做出恰好一个新 commit，代码与 runlog 同一 commit。
commit message 用 \`type(scope): subject\`。测试与被测代码放同一个 commit。
不要做下一笔，不要创建分支，不要 push，不要开 PR。`

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

const VERIFY_SCHEMA = {
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

const HANDBOOK = '<tech-design.md 或小档的 design.md 的绝对路径>'
const CHECKS = `<仓库自带 check 命令清单>`

const COMMITS = [
  {
    id: 'sN-c1',
    expected_base_sha: '<sha>',
    allowed_paths: '<逗号分隔路径>',
    runlog: '<.ai_docs/<slug>/runlog/s0N-c01.md 绝对路径>',
    checks: CHECKS,
    task: '…',
  },
]

const done: any[] = []
let head = COMMITS[0].expected_base_sha

for (const c of COMMITS) {
  phase(`Implement ${c.id}`)
  const result = await agent(
    `${BRIEFING}

【你的任务】
只做 plan_item_id=${c.id} 这一笔。手书是 ${HANDBOOK} 里与本笔相关的切片，按它写。
${c.task}

【约束】
expected_base_sha=${c.expected_base_sha}
允许改的路径：${c.allowed_paths}。除此之外不要动。
runlog 绝对路径：${c.runlog}
先把 runlog 写成 in-progress，完成后再改 status，与代码同一 commit。结束时报 HEAD。
不要把本 commit 的 sha 写进 runlog。

【完成判据】
${c.checks}

${COMMIT_RULES}

【返回】
只返回结构化结果。`,
    {...M, label: c.id, phase: `Implement ${c.id}`, schema: IMPLEMENT_SCHEMA},
  )

  done.push(result)
  if (!result || result.status !== 'committed') {
    log(`${c.id} 未提交：${result?.status ?? 'null'}`)
    return {stage: meta.name, stopped: c.id, result, implemented: done}
  }
  head = result.head_sha
  log(`${c.id} committed @ ${head}`)
}

phase('Verify')

let verdict: any = null
for (let round = 1; round <= 3; round++) {
  verdict = await agent(
    `${BRIEFING}

【你的任务】
跑下面的门禁命令，把失败全部修掉，然后重跑到全绿。修的内容打独立 fix commit，并写 runlog。

${CHECKS}

【上游实现】
${JSON.stringify(done, null, 2)}

【不要做】
不要为了让测试通过而弱化断言或跳过测试。不要改测试去迁就实现，除非测试本身写错了。
不要做吸收清单以外的重构。

${COMMIT_RULES}

【返回】
只返回结构化结果。`,
    {...M, label: `verify-r${round}`, phase: 'Verify', schema: VERIFY_SCHEMA},
  )

  if (verdict?.green) break
  log(`门禁第 ${round} 轮未通过：${(verdict?.unresolved ?? []).join('; ')}`)
}

return {stage: meta.name, verdict, implemented: done.length, head}

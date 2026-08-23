export const meta = {
  name: 'review-2-rounds',
  description: '对全量 diff 做两轮 review：找 → 对抗复核 → 修 → 门禁',
  phases: [
    {title: 'Round 1 · Dimensions', detail: '读 diff，定本轮维度', model: 'opus'},
    {title: 'Round 1 · Find', detail: '每维度一个 agent 并行找问题', model: 'opus'},
    {title: 'Round 1 · Verify', detail: '对抗式复核，宁缺勿滥', model: 'opus'},
    {title: 'Round 1 · Fix', detail: '按严重度修 + 门禁', model: 'opus'},
    {title: 'Round 2 · Dimensions', detail: '在修复产物上重定维度', model: 'opus'},
    {title: 'Round 2 · Find', detail: 'bug + 去重/简化/分层', model: 'opus'},
    {title: 'Round 2 · Verify', detail: '对抗式复核', model: 'opus'},
    {title: 'Round 2 · Fix', detail: '修 + 最终门禁', model: 'opus'},
  ],
}

const M = {model: 'opus', effort: 'xhigh'} as const

const BRIEFING = `【项目阶段】
我们现在处于内部开发阶段，没有真实用户，没有需要保护的线上数据，没有向后兼容负担。

【这意味着什么】
任何不是最佳实践的代码实现和架构设计，都会在后面造成巨大影响。所以：

- 不要为了兼容现有设计而妥协。现有代码写得不对就改它，不要在它旁边加一层适配。
- 尽可能往最佳实践靠齐。命名、分层、依赖方向、错误处理、类型精度，都按你认为对的做。
- 允许抽出公共部分、允许重构、允许删除。发现重复实现就合并，发现死代码就删掉。
- 但不要过度设计。不要为了假想的扩展点加抽象层，不要为了"以后可能要换实现"加接口。
- 不要提前过度防御。不要给不可能发生的输入加校验，不要为极端 corner case 加分支。
  过多的防御性代码和 corner case 处理，反倒是后续架构优化的负担 —— 它让人不敢改。

【判断标准】
问自己：如果这段代码的作者三个月后要重构它，我现在写的东西是帮他还是拖累他？
帮他的：清晰的分层、准确的类型、去掉的重复。
拖累他的：多余的抽象、防御性分支、为兼容旧写法留的双路径。

【风格】
读周边代码再写代码。注释密度、命名习惯、惯用法都跟着现有代码走，不要引入新的库或新的模式除非确有必要。`

const BASE = 'origin/main'
const CHECKS = `<仓库自带 check 命令清单>`

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
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'summary', 'failure_scenario', 'severity'],
        properties: {
          file: {type: 'string'},
          line: {type: 'number'},
          summary: {type: 'string'},
          failure_scenario: {type: 'string'},
          severity: {type: 'string', enum: ['high', 'medium', 'low']},
        },
      },
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['confirmed'],
  properties: {
    confirmed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'summary', 'failure_scenario', 'severity'],
        properties: {
          file: {type: 'string'},
          line: {type: 'number'},
          summary: {type: 'string'},
          failure_scenario: {type: 'string'},
          severity: {type: 'string', enum: ['high', 'medium', 'low']},
        },
      },
    },
    discarded: {type: 'array', items: {type: 'string'}},
  },
}

async function round(n: 1 | 2) {
  const focus =
    n === 1
      ? '正确性 bug、契约违背、缺失或过弱的测试。宽口径地找，先不做质量清理。'
      : '在第一轮修复之上重新找 bug（修复本身会引入新问题），外加去重、简化、分层高度、死代码。'

  phase(`Round ${n} · Dimensions`)
  const dims = await agent(
    `${BRIEFING}

【你的任务】
读 \`git diff ${BASE}...HEAD\` 的全量改动，定出本轮 review 要查的维度清单。
维度按 diff 的实际形状来定，不要套用固定清单。每个维度给出 name / scope（具体文件或目录）/ why。

【本轮关注】
${focus}

【返回】
只返回结构化维度清单。`,
    {...M, label: `dims-r${n}`, phase: `Round ${n} · Dimensions`, schema: DIM_SCHEMA},
  )

  phase(`Round ${n} · Find`)
  const found = (
    await parallel(
      (dims?.dimensions ?? []).map(
        (d: any) => () =>
          agent(
            `${BRIEFING}

【你的任务】
在维度「${d.name}」上审查 \`git diff ${BASE}...HEAD\`。
范围：${d.scope}
为什么查这个：${d.why}

【本轮关注】
${focus}

【报告门槛】
只报你能写出具体失效场景的问题：什么输入 / 什么状态 → 什么错误结果。
写不出触发路径的猜测不要报。风格偏好不要报。

【返回】
只返回结构化 findings。`,
            {...M, label: `find-${d.name}`, phase: `Round ${n} · Find`, schema: FIND_SCHEMA},
          ),
      ),
    )
  )
    .filter(Boolean)
    .flatMap((r: any) => r.findings ?? [])

  log(`第 ${n} 轮初筛 ${found.length} 条`)

  phase(`Round ${n} · Verify`)
  const verified = await agent(
    `${BRIEFING}

【你的任务】
对抗式复核下面每一条 finding。对每条：读实际代码，尝试构造真实触发路径。
能构造出来的保留（写清路径）；构造不出、或前提在本代码库里不可能成立的，丢弃并说明原因。
宁缺勿滥 —— 一条假阳性的成本高于漏掉一条 low。

【待复核】
${JSON.stringify(found, null, 2)}

【返回】
只返回结构化结果：confirmed（按严重度降序）+ discarded（每条一句原因）。`,
    {...M, label: `verify-r${n}`, phase: `Round ${n} · Verify`, schema: VERIFY_SCHEMA},
  )

  const confirmed = verified?.confirmed ?? []
  log(`第 ${n} 轮确认 ${confirmed.length} 条`)

  phase(`Round ${n} · Fix`)
  const fixed = await agent(
    `${BRIEFING}

【你的任务】
按严重度降序修下面这些已确认问题，然后跑门禁到全绿。

${JSON.stringify(confirmed, null, 2)}

【门禁】
${CHECKS}

【不要做】
不要顺手做清单外的改动。不要为了让测试通过而弱化断言。

【提交】
在当前分支上提交，commit message 用 \`fix(scope): subject\` 或 \`refactor(scope): subject\`。
不要创建分支，不要 push，不要开 PR。

【返回】
你的最终文本就是返回值。返回：每条问题的处置（fixed / skipped 及原因）、commit 列表、门禁结论。`,
    {...M, label: `fix-r${n}`, phase: `Round ${n} · Fix`},
  )

  return {round: n, found: found.length, confirmed, fixed}
}

const r1 = await round(1)
const r2 = await round(2)

return {r1, r2}

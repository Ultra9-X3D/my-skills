export const meta = {
  name: 'stage-N-<slug>',
  description: '<阶段目标一句话>',
  phases: [
    {title: 'Implement', detail: '按 commit 列表落地实现', model: 'opus'},
    {title: 'Verify', detail: 'typecheck / lint / test / repo checks', model: 'opus'},
  ],
}

const M = {model: 'opus', effort: 'xhigh'} as const

// 必须逐字内联，子 agent 看不到主会话上下文
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

const COMMIT_RULES = `【提交】
在当前 worktree 的当前分支上直接提交。commit message 用 \`type(scope): subject\`。
不要创建分支，不要 push，不要开 PR。测试与被测代码放同一个 commit。`

const RETURN_RULES = `【返回】
你的最终文本就是返回值，不是给人看的汇报。返回：改动文件清单、每条 commit 的 sha 与 subject、
判据命令的实际结论、以及你没能解决的问题（明确说清，不要粉饰）。`

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

// ---- 实现：文件不重叠的工作块并行；有依赖的串行 ----
phase('Implement')

const WORK = [
  {
    label: '<commit-1 slug>',
    task: `【你的任务】\n…\n\n【现状（已确认，无需重新探索）】\n…\n\n【不要做】\n…\n\n【完成判据】\n…`,
  },
  // …每块 8~15 个文件、深读 ≤5 个，控制在 300k 以内
]

const done = (
  await parallel(
    WORK.map(
      (w) => () =>
        agent(`${BRIEFING}\n\n${w.task}\n\n${COMMIT_RULES}\n\n${RETURN_RULES}`, {
          ...M,
          label: w.label,
          phase: 'Implement',
        }),
    ),
  )
).filter(Boolean)

log(`实现完成 ${done.length}/${WORK.length} 块`)

// ---- 收口：不绿就修，最多 3 轮 ----
phase('Verify')

const CHECKS = `<把仓库自带的 check 命令列在这里>`
let verdict: any = null

for (let round = 1; round <= 3; round++) {
  verdict = await agent(
    `${BRIEFING}

【你的任务】
跑下面的门禁命令，把失败全部修掉，然后重跑到全绿。

${CHECKS}

【上游实现摘要】
${done.join('\n\n---\n\n')}

【不要做】
不要为了让测试通过而弱化断言或跳过测试。不要改测试去迁就实现，除非测试本身写错了。

${COMMIT_RULES}

${RETURN_RULES}`,
    {...M, label: `verify-r${round}`, phase: 'Verify', schema: VERIFY_SCHEMA},
  )

  if (verdict?.green) break
  log(`门禁第 ${round} 轮未通过：${(verdict?.unresolved ?? []).join('; ')}`)
}

return {stage: meta.name, verdict, implemented: done.length}

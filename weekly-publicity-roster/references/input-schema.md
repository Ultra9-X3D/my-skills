# 输入、运行与输出

助手读取原图后创建输入；用户不必填写此格式。Python 3.9+，仅标准库。下面名字和日期是示例，每次替换成实际目标周，使用稳定人员ID。

```json
{
  "dates": ["2026-09-21", "2026-09-22"],
  "timezone": "Asia/Shanghai",
  "policy": {
    "buffer_minutes": 10,
    "allow_adjacent_signup": true,
    "adjacent_gap_minutes": 30,
    "max_uncovered_minutes": 60
  },
  "people": [
    {
      "id": "p01",
      "name": "示例甲",
      "roles": ["deep", "tent"],
      "days": {
        "2026-09-21": {
          "verified": true,
          "source": "示例甲课表.png，目标周周一，已核验整日",
          "course_windows": [["08:00", "22:00"]],
          "busy": [["08:00", "09:40"], ["13:30", "14:40"]],
          "unavailable": [["19:00", "21:00"]]
        }
      }
    },
    {
      "id": "p02",
      "name": "示例乙",
      "roles": ["tent"],
      "days": {
        "2026-09-21": {
          "verified": true,
          "source": "本周报名表，周一的18:00—19:30和20:00—22:00栏",
          "signup_windows": [["18:00", "19:30"], ["20:00", "22:00"]]
        }
      }
    }
  ],
  "staffing": {},
  "locked": [],
  "exclusions": []
}
```

## 字段含义

- `dates`：本次日期集合，通常7天，ISO日期，不自动把模板日期当本周。`timezone`用于交付的时间解释；脚本按每天本地钟点比较，不进行时间戳转换。
- `roles`：`deep`深入、`tent`棚子。未提供时两者均可；空列表表示不参与两种线下岗位。不要把“仅线上宣传”自动转成线下可用。
- `days`：按具体日期保存证据；缺失日期、`verified: false`或没有可用窗口都不安排。`verified: true`表示助手核验资料与日期匹配，**不是本人确认参加**。`source`写文件或表格定位及依据，不保存凭据。
- `course_windows`：当前目标周课表实际完整可读的时间范围，**不是空闲时间**；其中上课时间另填`busy`。完整整日截图可填覆盖宣传时段的范围；截图只到17点则不能扩成全天。脚本要求值班全程属于此范围并避开课程缓冲。截图不显示晚间或周末但有可靠校历证据时，注明补充证据后才扩充范围。
- `busy`：已知上课／补课时间；默认前后各留10分钟。所有已知课程都要录入，即使另有报名资料，不能由报名覆盖掉课程。`unavailable`为明确不可用时段，无额外缓冲。不要把灰色非本周课程录成有效课程。
- `signup_windows`：本次有效报名的可值班时段，支持多段合并。缺省表示无报名约束；空列表表示无可参考报名，不能当全天有空。若同时存在课表范围，两种证据都必须满足。
- 仅课表：`course_windows + busy`即可。仅有效报名：可用`signup_windows`；如果明知课程矛盾，仍填`busy`。不要为来源缺失的人编造全天可用窗口。
- `max_daily`、`max_weekly`：人员对象可选整数，只在用户明确限制时添加；默认无限制。它们按班次数计算，本技能各班均2小时。
- `policy`四个字段均可省略，默认值如上。待确认只允许由有效报名的部分覆盖产生，不能使未知课表范围变为可用。脚本报告具体未覆盖时间；超出默认范围先查证，再决定是否合理调整参数。
- `staffing`：可选映射，键`日期|时段ID`；深入人数只允许3或6，棚子至少2。例如`{"2026-09-21|deep_am": 6}`。默认每时段3/2人。不要在基础班仍缺人时无理由扩编。
- `locked`：保留既有有效安排，如`[{"person_id":"p01","slot_id":"2026-09-21|deep_am"}]`；锁定仍须通过所有硬约束，冲突则报错，不强行安排。
- `exclusions`：相同结构，仅排除该日期该班；用于用户移除某人后补位，不影响其他班次。

固定时段ID：`deep_am`10—12、`tent_midday`11—13、`deep_pm`15—17、`tent_pm`17—19、`tent_evening`19—21。输入更改时段的请求时，须先相应调整本次求解实现，不能继续套用这些固定钟点。

## 命令

将`<skill-dir>`替换为已发现的此技能目录，选择当前可用Python解释器；不假设某台电脑的绝对路径。

```text
python -X utf8 <skill-dir>/scripts/roster.py solve work/roster-input.json work/roster-result.json --trials 400 --seed 0
python -X utf8 <skill-dir>/scripts/roster.py validate work/roster-input.json work/roster-result.json
python -X utf8 <skill-dir>/scripts/test_roster.py
```

输出退出码0表示结构和硬约束校验通过，**不表示零缺口或所有人已确认**；必须读取`summary.shortage`和`summary.pending`。非法输入或不合规方案退出码2。排班是固定种子的启发式，不能把搜索没有找到人员当作数学无解证明。输入本身的识图错误不能由脚本检测，必须人工核对原图。

输出`slots`包括人员、证据、未覆盖时间、小组及缺口；`workload`为每人班次和工时（含零班）；`summary`包含需求人次、已排人次、不同人数、缺口及待确认人次。`pending: false`只表示没有相邻报名推定，仍应在页面按`basis`显示课表推定或报名覆盖，不能统一写“本人已确认”。

验证修改后的方案时，人数统计和派生信息也须更新；更稳妥的办法是把改动写成`locked/exclusions`后重新求解，所有输出一起生成。脚本不联网发布，飞书写入由助手按相关技能完成。

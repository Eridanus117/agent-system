<!-- 生成产物：node plugins/scripts/skills-overview.ts --write。不要手改；
     三句话的来源是 plugins/tests/workflow-routing.json 的 skillOverview。 -->

# Skill 选型面

这是给人看的入口：每个 Skill 替你做什么、什么时候会用到、你怎么看出它在起作用，
以及它在不同加载层和维护面上的实测体积。`SKILL.md` 是给 Agent 执行的行为合同，优先保证触发、硬门、分支和退出完整，不是按顺序阅读的教程；只有维护或审查行为时才需要下钻。

当前 14 个 Skill：L1 descriptions 8,727 字节；L2 主合同 160,949 字节；L3 按需 references 208,453 字节；递归维护面合计 369,402 字节。

L1 受每项 1000 UTF-8 字节可见性门约束；L2 只在选择 Skill 后加载；L3 只在正文明确路由后按需加载。三者不是同一个运行上下文预算。维护面递归计量全部可执行 Markdown，但不设置会诱导搬运文字的字节上限。

| Skill | 版本 | L1 描述 | L2 主合同 | L3 引用 | 维护面占比 | 上次复核 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| [adaptive-problem-solving](#adaptive-problem-solving) | 0.2.13 | 946 B | 9.2 KB | 124.6 KB | 37.1% | 2026-08-25 |
| [issue-workflow](#issue-workflow) | 0.3.18 | 658 B | 23.6 KB | 36.5 KB | 16.7% | 2026-08-15 |
| [orchestrated-collaboration](#orchestrated-collaboration) | 0.2.7 | 876 B | 21.3 KB | 28.9 KB | 13.9% | 2026-08-15 |
| [self-improvement](#self-improvement) | 0.1.7 | 673 B | 8.8 KB | 7.2 KB | 4.4% | 2026-08-15 |
| [pr-integration](#pr-integration) | 0.3.18 | 581 B | 15.6 KB | 0.0 KB | 4.3% | 2026-08-15 |
| [issue-delivery](#issue-delivery) | 0.3.18 | 554 B | 15.2 KB | 0.0 KB | 4.2% | 2026-08-15 |
| [objective-to-issues](#objective-to-issues) | 0.3.18 | 491 B | 13.0 KB | 0.0 KB | 3.6% | 2026-08-15 |
| [operating-ledger-maintenance](#operating-ledger-maintenance) | 0.3.18 | 749 B | 11.5 KB | 0.0 KB | 3.2% | 2026-08-15 |
| [skill-appraisal](#skill-appraisal) | 0.2.0 | 781 B | 10.2 KB | 0.0 KB | 2.8% | 2026-08-25 |
| [resource-observability](#resource-observability) | 0.2.4 | 608 B | 5.6 KB | 4.1 KB | 2.7% | 2026-08-15 |
| [issue-contract-compaction](#issue-contract-compaction) | 0.3.18 | 481 B | 8.6 KB | 0.0 KB | 2.4% | 2026-08-15 |
| [skill-maintenance](#skill-maintenance) | 0.1.1 | 334 B | 4.3 KB | 2.2 KB | 1.8% | 2026-08-16 |
| [knowledge-maintenance](#knowledge-maintenance) | 0.1.3 | 644 B | 6.3 KB | 0.0 KB | 1.8% | 2026-08-15 |
| [grilling](#grilling) | 0.1.2 | 351 B | 3.9 KB | 0.0 KB | 1.1% | 2026-08-15 |

## adaptive-problem-solving

**它替你做什么** 问题求解治理：选方法、控成本、该退出就退出，别在一条路上耗死。

**什么时候用** 第一次实质路径选择、进展停滞、范围明显扩大或要交接验收时。

**你怎么知道它在起作用** 方向变了会明确说出来；没变就直接继续，不额外汇报。

**什么会让它失效** 方法登记面的证据等级分布与登记面 README 声明不符；或三端 description 可见预算的实测基线（2026-08-11 测得 1000 UTF-8 字节）被新的实测推翻；或 INDEX 的「与装配内其他 Skill 的分界」表所列执行流程承载者（bmad-brainstorming、bmad-advanced-elicitation、bmad-forge-idea、bmad-party-mode、bmad-deep-recon、grilling）的 description 触发面发生变化，使该表的对应关系不再成立。

所属 Plugin `adaptive-problem-solving` `0.2.13`｜L1 946 B｜L2 9.2 KB｜L3 124.6 KB｜递归维护面 133.8 KB（占总维护面 37.1%）｜Agent 行为合同（维护／审查时读取）[`plugins/adaptive-problem-solving/skills/adaptive-problem-solving/SKILL.md`](../adaptive-problem-solving/skills/adaptive-problem-solving/SKILL.md)

## issue-workflow

**它替你做什么** 把一个 GitHub Issue 子树推进到下一段：选叶子、派交付、消费负责人决定并回收父级。

**什么时候用** 有明确 Issue、父级缺口或负责人短回复需要推进时；普通问答和无 Issue 工作不用。

**你怎么知道它在起作用** 远端 Issue 上出现可恢复的段结果、负责人动作状态、关闭授权判断和下一责任人。

**什么会让它失效** GitHub Issue 子树生命周期、负责人决定、关闭授权或 Project 投影的权威规则变化，使本 Skill 的唯一生命周期决定者边界不再成立。

所属 Plugin `github-collaboration` `0.3.18`｜L1 658 B｜L2 23.6 KB｜L3 36.5 KB｜递归维护面 60.1 KB（占总维护面 16.7%）｜Agent 行为合同（维护／审查时读取）[`plugins/github-collaboration/skills/issue-workflow/SKILL.md`](../github-collaboration/skills/issue-workflow/SKILL.md)

## orchestrated-collaboration

**它替你做什么** 多 Agent、多 Session 时的写入所有权、派发合同与独立验收。

**什么时候用** 已授权的多席协作或共享写入碰撞。单 Session 不触发。

**你怎么知道它在起作用** Issue 上出现类型化派发合同，以及与实施者不同的独立验收回执。

**什么会让它失效** 所选协调后端（当前 orca orchestration）的 Run／Task／Dispatch 语义或标准释放回执格式变化；或其唯一原则源 agent-control/authority/05-resource-operations.md 的资源投入原则变化，使 R1–R6 派发门失去依据。

所属 Plugin `orchestrated-collaboration` `0.2.7`｜L1 876 B｜L2 21.3 KB｜L3 28.9 KB｜递归维护面 50.2 KB（占总维护面 13.9%）｜Agent 行为合同（维护／审查时读取）[`plugins/orchestrated-collaboration/skills/orchestrated-collaboration/SKILL.md`](../orchestrated-collaboration/skills/orchestrated-collaboration/SKILL.md)

## self-improvement

**它替你做什么** 把一次纠正变成系统改进，并判断该改入口、改 Skill 还是只记任务。

**什么时候用** 你指出漂移、误解，或同类错误复发时。一次性小错不触发。

**你怎么知道它在起作用** 纠正落到某个持久载体，而不只是当次口头改了。

**什么会让它失效** 入口、Skill、任务记录三个改进承载面之一消失或职责变更，使路由判据指向不存在的去向。

所属 Plugin `self-improvement` `0.1.7`｜L1 673 B｜L2 8.8 KB｜L3 7.2 KB｜递归维护面 16.0 KB（占总维护面 4.4%）｜Agent 行为合同（维护／审查时读取）[`plugins/self-improvement/skills/self-improvement/SKILL.md`](../self-improvement/skills/self-improvement/SKILL.md)

## pr-integration

**它替你做什么** 按当前 head 验收、修复、转 ready 或合并 GitHub PR，并区分检查、审查和授权。

**什么时候用** 已有 PR 需要整合、Draft 转 ready、处理审查／CI／冲突或执行明确合并授权时。

**你怎么知道它在起作用** 回执绑定当前 head，列出 checks、review、merge state、授权来源和合并后复核。

**什么会让它失效** GitHub PR 的 draft、review、required checks、merge state、评论主体或合并授权语义变化，使当前 head 绑定和整合门不再可靠。

所属 Plugin `github-collaboration` `0.3.18`｜L1 581 B｜L2 15.6 KB｜L3 0.0 KB｜递归维护面 15.6 KB（占总维护面 4.3%）｜Agent 行为合同（维护／审查时读取）[`plugins/github-collaboration/skills/pr-integration/SKILL.md`](../github-collaboration/skills/pr-integration/SKILL.md)

## issue-delivery

**它替你做什么** 把一个已就绪 GitHub Issue 交付成 Draft PR 或自足证据评论，并留下验证事实。

**什么时候用** 范围、授权、成功条件和交付形态已在 Issue 合同里明确时。

**你怎么知道它在起作用** 有稳定 PR 或评论 URL、当前 head、实际验证记录和未运行项说明。

**什么会让它失效** Draft PR、证据评论、分支所有权或 GitHub 交付复核语义变化，使单个已就绪 Issue 不能按合同形成可独立核验交付物。

所属 Plugin `github-collaboration` `0.3.18`｜L1 554 B｜L2 15.2 KB｜L3 0.0 KB｜递归维护面 15.2 KB（占总维护面 4.2%）｜Agent 行为合同（维护／审查时读取）[`plugins/github-collaboration/skills/issue-delivery/SKILL.md`](../github-collaboration/skills/issue-delivery/SKILL.md)

## objective-to-issues

**它替你做什么** 把已授权的长程目标拆成 GitHub 原生父子 Issue 图，写清依赖、所有权和交付合同。

**什么时候用** 目标已对齐且持久任务图会改善并行、恢复或依赖管理时。

**你怎么知道它在起作用** 子 Issue、label、原生父子关系、Project 条目和状态都能从远端回读。

**什么会让它失效** GitHub 原生 sub-issue、label、ProjectV2 item 或任务图分类规则变化，使父子图创建和分类投影不能按正文复核。

所属 Plugin `github-collaboration` `0.3.18`｜L1 491 B｜L2 13.0 KB｜L3 0.0 KB｜递归维护面 13.0 KB（占总维护面 3.6%）｜Agent 行为合同（维护／审查时读取）[`plugins/github-collaboration/skills/objective-to-issues/SKILL.md`](../github-collaboration/skills/objective-to-issues/SKILL.md)

## operating-ledger-maintenance

**它替你做什么** 维护跨 Session 经营总账观察面：诉求、计划、交付、负责人等待和状态投影。

**什么时候用** 需要把当前事实登记到经营总账，或用户明确要求维护总账时。

**你怎么知道它在起作用** Project 条目和字段只反映已核验远端事实，不替代 Issue 合同或负责人决定。

**什么会让它失效** 经营总账 Project、Status 字段、负责人动作投影或跨 Session 观察面规则变化，使本 Skill 不能只维护观察面而不成为权威源。

所属 Plugin `github-collaboration` `0.3.18`｜L1 749 B｜L2 11.5 KB｜L3 0.0 KB｜递归维护面 11.5 KB（占总维护面 3.2%）｜Agent 行为合同（维护／审查时读取）[`plugins/github-collaboration/skills/operating-ledger-maintenance/SKILL.md`](../github-collaboration/skills/operating-ledger-maintenance/SKILL.md)

## skill-appraisal

**它替你做什么** 判定一个 Skill 组该不该进当前装配、归哪些事项、与谁重叠，并留下下次复核的最小步骤。

**什么时候用** 有候选组要决定收不收、组早已在用却从未判定过、怀疑与现有组重叠，或已判定过的组到了复核节拍时。

**你怎么知道它在起作用** 给出的是判定与证据，不是安装动作；重叠优先在装配层处置而不是退役；每次判定都带失效条件和下次最少复核步骤。

**什么会让它失效** 组作为判定单位的前提变化：装配层不再按组声明能力（configs 的 stable_config_revision.skills_json 或 OMP 的 skills.customDirectories／includeSkills 语义改变），使「判定一个组」不再对应任何可装配的单位；或来源三分（own／fork／vendor）的判据——是否允许本地改动——不再能机械验证；或装配白名单语义被改成黑名单，使「改装配声明」不再是有效处置。

所属 Plugin `skill-appraisal` `0.2.0`｜L1 781 B｜L2 10.2 KB｜L3 0.0 KB｜递归维护面 10.2 KB（占总维护面 2.8%）｜Agent 行为合同（维护／审查时读取）[`plugins/skill-appraisal/skills/skill-appraisal/SKILL.md`](../skill-appraisal/skills/skill-appraisal/SKILL.md)

## resource-observability

**它替你做什么** 分开看两件事：账户还剩多少额度何时恢复，和这次工作实际花了多少。

**什么时候用** 准备扩大并发、资源接近耗尽，或你问额度时。

**你怎么知道它在起作用** 给出带时间戳的读数；取不到就明说未知，不猜。

**什么会让它失效** orca account list --json 的返回结构变化：顶层 ok、result.rateLimits.claude／codex 的 status 与 updatedAt，或 usedPercent／windowMinutes／resetsAt／rateLimitResetCredits 这些窗口字段不再按 Skill 正文描述提供。

所属 Plugin `resource-observability` `0.2.4`｜L1 608 B｜L2 5.6 KB｜L3 4.1 KB｜递归维护面 9.7 KB（占总维护面 2.7%）｜Agent 行为合同（维护／审查时读取）[`plugins/resource-observability/skills/resource-observability/SKILL.md`](../resource-observability/skills/resource-observability/SKILL.md)

## issue-contract-compaction

**它替你做什么** 把过长或漂移的 GitHub Issue 正文压回当前合同，同时保留评论审计轨迹。

**什么时候用** 正文落后于评论、准备派发或跨 Session 交接时；短讨论不触发。

**你怎么知道它在起作用** 正文有八项当前合同，恢复快照评论可重读，写后远端状态被复核。

**什么会让它失效** GitHub Issue 正文、评论、updatedAt 或恢复快照语义变化，使写前快照、最终重读或正文排他所有权不能可靠防止覆盖当前合同。

所属 Plugin `github-collaboration` `0.3.18`｜L1 481 B｜L2 8.6 KB｜L3 0.0 KB｜递归维护面 8.6 KB（占总维护面 2.4%）｜Agent 行为合同（维护／审查时读取）[`plugins/github-collaboration/skills/issue-contract-compaction/SKILL.md`](../github-collaboration/skills/issue-contract-compaction/SKILL.md)

## skill-maintenance

**它替你做什么** 创建、审计、拆分、升级或退役 Skill 时，把行为合同、调用者、版本、预算、评估和验证一次维护完整。

**什么时候用** 已经确定要维护某个 Skill 时；尚未决定行为该放哪里时不用。

**你怎么知道它在起作用** 改动前有行为判据和必要时的配对评估，改动后没有旧调用者，版本、生成物、预算、验证和独立审查能相互对上。

**什么会让它失效** Skill 的发现入口、版本声明、复杂度预算、生成物、评估合同／校验汇总工具或发布／退役工具发生变化，使正文盘点面和 clean cutover 步骤不再覆盖真实运行路径。

所属 Plugin `skill-maintenance` `0.1.1`｜L1 334 B｜L2 4.3 KB｜L3 2.2 KB｜递归维护面 6.5 KB（占总维护面 1.8%）｜Agent 行为合同（维护／审查时读取）[`plugins/skill-maintenance/skills/skill-maintenance/SKILL.md`](../skill-maintenance/skills/skill-maintenance/SKILL.md)

## knowledge-maintenance

**它替你做什么** 知识准入：价值门、可信门、失效条件与下次最少复核步骤。

**什么时候用** 多来源调研、可重复实验，或结论会影响权威与重要决定时。

**你怎么知道它在起作用** 写下的知识带失效条件和下次复核步骤，做不到复核就退出当前知识。

**什么会让它失效** agent-control/authority/01-knowledge.md 的两道准入门或可信门八项条件发生变化。

所属 Plugin `knowledge-maintenance` `0.1.3`｜L1 644 B｜L2 6.3 KB｜L3 0.0 KB｜递归维护面 6.3 KB（占总维护面 1.8%）｜Agent 行为合同（维护／审查时读取）[`plugins/knowledge-maintenance/skills/knowledge-maintenance/SKILL.md`](../knowledge-maintenance/skills/knowledge-maintenance/SKILL.md)

## grilling

**它替你做什么** 用结构化追问压力测试一个计划或决定，把没想清楚的地方逼出来。

**什么时候用** 你直接要求，或明确接受建议时。它不会因为任务复杂就自动开始。

**你怎么知道它在起作用** 你会被连续追问，且随时可以喊停或换普通路径。

**什么会让它失效** 明示同意门被取消，或运行端改为按关键词自动进入长期盘问。

所属 Plugin `grilling` `0.1.2`｜L1 351 B｜L2 3.9 KB｜L3 0.0 KB｜递归维护面 3.9 KB（占总维护面 1.1%）｜Agent 行为合同（维护／审查时读取）[`plugins/grilling/skills/grilling/SKILL.md`](../grilling/skills/grilling/SKILL.md)

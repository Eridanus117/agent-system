# 原始记录索引

> 观察时间：2026-08-09 12:29–12:42（America/New_York）。
> 本文件只保存来源指针、完整性信息和限制，不复制会话正文。
> 所有 Codex rollout 默认按敏感原始记录处理，不进入 Git、不默认加载。

## S01｜当前根 Session 与直接子 Session

- 类型：Codex rollout JSONL；
- 根线程：`019fdbe9-4f7e-79d1-95d4-25c7a83cff69`；
- `CODEX_HOME`：`C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home`；
- 根路径：`sessions\2026\08\07\rollout-2026-08-07T07-08-48-019fdbe9-4f7e-79d1-95d4-25c7a83cff69.jsonl`；
- 保存状态：仅当前主机可用，根文件仍在增长；未核验平台长期保留策略；
- 观察快照：12:37 扫描得到 17,107 条完整 JSONL、0 个解析错误；根约 37.7 MiB，根与 25 个直接子文件合计约 87 MiB；
- 完整性：活动文件不计算 SHA-256；关闭且确认不再增长后再计算；
- 限制：包含用户原话、系统级指令、运行环境、工具输入输出、部分推理摘要或密文以及可能的敏感信息。`rollout` 也不能证明保存了完整内部思维过程；
- 核验报告：[R06]。

### 直接子 Session 指针

所有条目的 `parent_thread_id` 都是根线程；路径相对于上述 `CODEX_HOME`。大小是 12:41 左右的观察值，生命周期未单独核验。

| Agent 路径 | 子线程 | 相对路径 | 观察字节数 |
| --- | --- | --- | ---: |
| `/root/adjudicate_a` | `019fdeaa-8f9a-7240-bee0-5f6f0a5a3ecb` | `sessions\2026\08\07\rollout-2026-08-07T19-59-07-019fdeaa-8f9a-7240-bee0-5f6f0a5a3ecb.jsonl` | 243074 |
| `/root/adjudicate_c` | `019fdeac-89f3-75e1-b970-fd847459339d` | `sessions\2026\08\07\rollout-2026-08-07T20-01-17-019fdeac-89f3-75e1-b970-fd847459339d.jsonl` | 385272 |
| `/root/audit_codex_control` | `019fe510-df0e-7420-bf2c-02b1d1608d65` | `sessions\2026\08\09\rollout-2026-08-09T01-48-35-019fe510-df0e-7420-bf2c-02b1d1608d65.jsonl` | 357742 |
| `/root/baseline_method_audit` | `019fde90-b4ae-7250-8ed5-df33fd45456b` | `sessions\2026\08\07\rollout-2026-08-07T19-30-53-019fde90-b4ae-7250-8ed5-df33fd45456b.jsonl` | 290130 |
| `/root/behavior_patch_review` | `019fe75c-7e2e-70e1-9425-277eceacee85` | `sessions\2026\08\09\rollout-2026-08-09T12-30-26-019fe75c-7e2e-70e1-9425-277eceacee85.jsonl` | 416936 |
| `/root/codex_windows_sandbox_issue` | `019fe43a-ca42-7ea1-a496-0702c72b5bef` | `sessions\2026\08\08\rollout-2026-08-08T21-54-45-019fe43a-ca42-7ea1-a496-0702c72b5bef.jsonl` | 7835599 |
| `/root/exec_a_clean` | `019fde96-c33f-7892-a931-aaae8d969068` | `sessions\2026\08\07\rollout-2026-08-07T19-37-30-019fde96-c33f-7892-a931-aaae8d969068.jsonl` | 600282 |
| `/root/exec_a_knowledge` | `019fde96-ee60-7de3-8e0d-dfe081118a94` | `sessions\2026\08\07\rollout-2026-08-07T19-37-41-019fde96-ee60-7de3-8e0d-dfe081118a94.jsonl` | 385790 |
| `/root/exec_b_clean` | `019fde97-1429-71c0-9be4-cf2094f53082` | `sessions\2026\08\07\rollout-2026-08-07T19-37-50-019fde97-1429-71c0-9be4-cf2094f53082.jsonl` | 465647 |
| `/root/exec_b_knowledge` | `019fde97-3e32-70a1-bac5-e69529a27191` | `sessions\2026\08\07\rollout-2026-08-07T19-38-01-019fde97-3e32-70a1-bac5-e69529a27191.jsonl` | 381441 |
| `/root/exec_c_clean` | `019fde97-66ed-7860-be20-787848da6bf1` | `sessions\2026\08\07\rollout-2026-08-07T19-38-12-019fde97-66ed-7860-be20-787848da6bf1.jsonl` | 944100 |
| `/root/exec_c_knowledge` | `019fde97-92bd-71d3-958a-2d58be78c258` | `sessions\2026\08\07\rollout-2026-08-07T19-38-23-019fde97-92bd-71d3-958a-2d58be78c258.jsonl` | 596986 |
| `/root/fresh_recovery_check` | `019fe59f-0223-7580-88ed-1c3abea3651e` | `sessions\2026\08\09\rollout-2026-08-09T04-23-51-019fe59f-0223-7580-88ed-1c3abea3651e.jsonl` | 141928 |
| `/root/knowledge_skill_candidate` | `019fe75b-54f4-7023-8865-20af22626ddd` | `sessions\2026\08\09\rollout-2026-08-09T12-29-10-019fe75b-54f4-7023-8865-20af22626ddd.jsonl` | 440538 |
| `/root/material_audit_002` | `019fdfe8-4f7e-71a3-877a-6f39282a99d1` | `sessions\2026\08\08\rollout-2026-08-08T01-46-11-019fdfe8-4f7e-71a3-877a-6f39282a99d1.jsonl` | 1890932 |
| `/root/orca_collaboration_audit` | `019fe75b-70d6-79d1-99ec-aa7c5563e1cf` | `sessions\2026\08\09\rollout-2026-08-09T12-29-17-019fe75b-70d6-79d1-99ec-aa7c5563e1cf.jsonl` | 652574 |
| `/root/rd_memory_design` | `019fe75b-202c-7850-ac01-941061a6fff6` | `sessions\2026\08\09\rollout-2026-08-09T12-28-56-019fe75b-202c-7850-ac01-941061a6fff6.jsonl` | 13465971 |
| `/root/review_a_1` | `019fdea5-0ce5-73e3-96df-9f9401a7fc39` | `sessions\2026\08\07\rollout-2026-08-07T19-53-06-019fdea5-0ce5-73e3-96df-9f9401a7fc39.jsonl` | 674576 |
| `/root/review_a_2` | `019fdea5-342b-7310-ba0b-0923c7ad0fda` | `sessions\2026\08\07\rollout-2026-08-07T19-53-16-019fdea5-342b-7310-ba0b-0923c7ad0fda.jsonl` | 322622 |
| `/root/review_b_1` | `019fdea5-60a0-7e51-bd15-859c8904bd2f` | `sessions\2026\08\07\rollout-2026-08-07T19-53-27-019fdea5-60a0-7e51-bd15-859c8904bd2f.jsonl` | 866706 |
| `/root/review_b_2` | `019fdea5-83f9-7973-8612-6b686ed20953` | `sessions\2026\08\07\rollout-2026-08-07T19-53-37-019fdea5-83f9-7973-8612-6b686ed20953.jsonl` | 452690 |
| `/root/review_c_1` | `019fdea5-b40e-7bd0-b8aa-86f195fd9550` | `sessions\2026\08\07\rollout-2026-08-07T19-53-49-019fdea5-b40e-7bd0-b8aa-86f195fd9550.jsonl` | 1101283 |
| `/root/review_c_2` | `019fdea5-d547-7380-bd06-9cfe496b886a` | `sessions\2026\08\07\rollout-2026-08-07T19-53-57-019fdea5-d547-7380-bd06-9cfe496b886a.jsonl` | 701009 |
| `/root/session_retrospective` | `019fe75c-a834-7bf0-8920-75f085afd00c` | `sessions\2026\08\09\rollout-2026-08-09T12-30-37-019fe75c-a834-7bf0-8920-75f085afd00c.jsonl` | 13533819 |
| `/root/session_source_audit` | `019fe75b-3a65-78f3-85fb-2fe65a2739d2` | `sessions\2026\08\09\rollout-2026-08-09T12-29-03-019fe75b-3a65-78f3-85fb-2fe65a2739d2.jsonl` | 588899 |

### 关键纠正的低成本定位

下面只保存足以在根 rollout 中搜索的负责人原话短语，不复制上下文，也不把短语本身当成完整证据。搜索结果仍需结合前后消息核对。

| 记录事件 | 来源 | 可搜索短语 |
| --- | --- | --- |
| E05 | S01 根线程 | `我怎么感觉你有点漂移了？就是你还记得最初的任务吗？` |
| E07 | S01 根线程 | `对齐结束，是否应该将对齐内容先固化权威化？`；`为啥这个文档还裁剪了？` |
| E10 | S01 根线程 | `重点不是验证,重点是自我优化有问题`；`我们的讨论长期没有被沉淀` |
| E11 | S01 根线程 | `实际上目前agent 应该只有 系统提示词和 skills`；`现在还没有优化skill，也没有优化系统提示词` |
| E12 | S01 根线程 | `我想让你从非常高维去思考`；`自己主导推导出这些东西`；`我已经感受到你一直在循环了` |
| E26 | S01 根线程 | `为什么不能利用issue拆解`；`还记得我所说的公司的概念吗`；`我目前没有看到一个地方可以看当前有哪些事情` |
| E27 | S01 根线程 | `你要先攻防我的诉求`；`能不能利用的看板还有issue啊，还有board的功能`；四轮 grilling 的 `A／B／C` 选择与最终批准；`验收通过。目前我似乎只能通过tui告知` |
| E28 | S01 根线程 | `你只是构建完了，skills化了吗`；随后对“最小维护 Skill + 短入口 + 通用完成检查”的明确批准 |

## S02｜`agent-control` Git 历史与当前文件

- 类型：版本化权威、任务状态和研发记录；
- 位置：本仓；远程 `https://github.com/Eridanus117/agent-control`；
- 关键提交起点：`f2a7420`（思考模式根概念）至当前分支；本批次研发记忆、权威和入口修改首次进入提交 `6ab6b30`；
- 保存状态：Git 保存并有私有远程；
- 核对方式：`git log --oneline`、`git show <commit>`、`git diff`；
- 限制：Git 历史保存文件变化，不保存所有会话理由；历史文件也不自动代表当前权威。

## S03｜`agent-plugins` Git 历史、来源与安装缓存

- 类型：跨 Codex／Claude 的版本化 Plugin 源码；
- 位置：`C:\Users\<user>\workspace\agent-plugins`；远程 `https://github.com/Eridanus117/agent-plugins`；
- 已推送基线：`87c0322`（`self-improvement` `0.1.0`）；`self-improvement` `0.1.2` 首次进入 `712c4be`，`knowledge-maintenance` `0.1.0` 进入 `d35ff98`，`orchestrated-collaboration` `0.1.0` 进入 `e84975c`，后端中立的 `0.1.1` 进入 `389eda3`；
- 真实入口：普通 Codex、Orca Codex 和 Claude 的 Plugin 安装缓存；
- 保存状态：源码由 Git 保存；安装缓存只表示本机运行状态，不是权威来源；
- 核对方式：manifest 版本、`SKILL.md` SHA-256、`codex plugin list --json`、`claude plugin list --json`；
- 限制：静态与安装一致性不能证明真实任务中的行为质量。

## S04｜自适应求解调研文件

- 类型：事实调研与方案综合，非权威；
- 位置：`codex-work/research/adaptive-problem-solving-definition/research.md` 与 `innovate.md`；
- 大小／SHA-256：`15985`／`811563D6A954B0F954F89F1B4764816784B4816873DD181A9DF84686216C2126`；`9172`／`110EE3C22D984DE220BC157C2544B44F71308E78EC46DDCF9C98A33290B86071`；
- 保存状态：仅当前主机可用，目录被 Git 忽略；
- 限制：不能跨 Host 恢复；内容是调研与候选，不是当前权威。
- **2026-08-15 更新**：上述「仅当前主机可用」已不再成立。该文件已迁入 [`work/records/2026-08-15-codex-work-salvage/raw/agent-control/research/adaptive-problem-solving-definition/`](../../2026-08-15-codex-work-salvage/raw/agent-control/research/adaptive-problem-solving-definition/) 并纳入版本控制；上面两个 SHA-256 经 CRLF→LF 归一化后与迁入副本逐字节一致。原始 `codex-work/` 目录已随本地工作副本重建而不存在。本行只更新位置与保存状态，不修改 08-09 当时的判断记录。

## S05｜首个 K1 知识包

- 类型：公共技术知识 MVP 样本；
- 位置：`work/knowledge-trial/project-instructions.md`；
- 大小／SHA-256：`4874`／`C3FD4008FD1789B5FDF8B3FF9B87D71CB49481CF27F508D1D86F0D5A7A3C1428`；
- 保存状态：Git 保存；
- 限制：已经通过人工可读性检查，但尚未用自然复用证明长期收益。

## Agent 独立报告

| 编号 | 报告 | 大小 | SHA-256 | 状态与限制 |
| --- | --- | ---: | --- | --- |
| R01 | `../agent-reports/rd-memory-design.md` | 10847 | `89DBF00AA89F9D5BD727DAE1CFDEC9BAF7064720321210C2636B2778E5F21663` | 候选设计，不是权威 |
| R02 | `../agent-reports/session-retrospective-draft.md` | 24577 | `4C8DDDA5A164C77E021B983DE023D79453E073D953EDAFFE33CA4DA81AD63043` | 可见对话回顾草稿，早期缺失已标注 |
| R03 | `../agent-reports/knowledge-skill-candidate.md` | 12958 | `8EADCFFDA433FB35F2679617B9EF5C54B8CD9B30015AAE2DB421963A1053B445` | Skill 候选，不是正式资产 |
| R04 | `../agent-reports/orca-collaboration-audit.md` | 17234 | `F52A4B8B4C9C9A57A21DFCBEB55CADB99276AACB8605C1AB475143DA70DC8EC5` | 只读能力审计与候选，不是 Orca 运行记录 |
| R05 | `../agent-reports/behavior-patch-review.md` | 10667 | `D5D179CD6FC6C27B70CB77EFCD76C7B3BA1AE6C051F8866DEAE911E4D501DB6C` | 对未发布 `0.1.1` 的独立审查及 `0.1.2` 复查；阻断已关闭 |
| R06 | `../agent-reports/session-source-audit.md` | 10472 | `B35549676823EC253E10241CA0BC775D0F31C277113436C9C371C444B74BF9EB` | 原始来源审计；计数是活动文件的时间点快照 |
| R07 | `../agent-reports/rd-memory-implementation-review.md` | 7496 | `8B35E0FE289F49E1FB3CD46D512572BE351CDFB70B0B55F7E8642127B9E6C41F` | 双层研发记忆实施审查；通过，无阻断项 |

## S06｜第一次正式跨 Session Orca Run

- 类型：Orca orchestration Run、Task、Dispatch 与 Delivery 记录；
- Run：`run_d6bfb82e9782`；
- 协调 Session：终端 `term_b945c02c-2c71-44c0-b4e4-41960d444efd`，Codex 线程 `019fdbe9-4f7e-79d1-95d4-25c7a83cff69`；
- 协作 Session：终端 `term_7fc4587e-f7db-4336-9274-94e8899a9742`，Codex 线程 `019fe76b-e736-7b20-8836-e602ba4293eb`；
- Task：`task_8a9a69ac6b08`（只读碰撞盘点）、`task_c97642f1f892`（受限工作区清理）、`task_39672be2394f`（知识 Skill 只读复核）、`task_219917ecebf1`（发布阻断复查）、`task_6e97647b7aba`（协作 Skill 只读复核）、`task_5348a3f3dbf2`（协作后端边界复查）；
- 保存状态：结构化运行状态当前由本机 Orca 保存；关键决定、观察与事故另写入可读记录，尚未验证跨 Host 恢复；
- 核对方式：`orca orchestration run-show`、`task-list`、`dispatch-show` 与 `inbox`；
- 限制：Orca 记录能证明消息和任务状态，不证明 Agent 没有未报告的内部判断，也不自动证明文件、Git 或工具副作用符合任务边界。

## Orca 派生缓存

- 位置：`C:\Users\<user>\AppData\Roaming\orca\ai-vault\session-parse-cache.json`；
- 用途：帮助发现根 rollout 路径；
- 状态：可变化的 UI／解析缓存，不是原始来源；
- 限制：包含少量会话正文预览，且 `subagentTranscriptCount` 与实际子文件不一致；不提交、不作为完整性依据。

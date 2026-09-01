<!-- 生成产物：node tools/skill_registry/skill-registry.ts --write。不要手改。
     组、事项与归组规则来自 matters.json；判定认知来自 workflow-routing.json 与 appraisals.json。 -->

# Skill 资产面

**组是第一结构。** 装卸、版本、发现、判定、复核都以组为单位，不以 Skill 为单位——
63 个 Skill 实际是 10 个组，判定 10 次，不是 63 次。

## 组的形态

组不是 OMP plugin。2026-08-24 实测（omp v18.0.3）：OMP 的 skill 与 plugin 是两套独立机制。skill 走目录约定加选择开关——skills.enable{Pi,Claude,Agents,Codex}{User,Project}、skills.customDirectories、skills.includeSkills、skills.ignoredSkills；plugin 走 npm 包加 TS/JS extension（导出 factory 的代码模块），install grilling 解析到 registry.npmjs.org 返回 404，install/link 按路径报 package.json not found。因此本仓的 Skill 资产不走 plugin 道。组是本仓自己的概念，OMP 侧的投影是 customDirectories 加 includeSkills，由 configs 在启动时装配——没有任何东西被安装。版本、来源与更新触发 OMP 完全不提供，必须由本文件与 configs 承担。

## 命名

组的中文名只用于人读表面（资产面、对话）；机器名保持 kebab-case ASCII——三端按名路由，且 .cap 要求稳定机器 id、路径、命令与配置键保持规范形式。bmad 与 openspec 是上游产品专名，不译：译了会让人对不上上游文档与 release notes。Codex 端的对应显示名在各 skill 的 agents/openai.yaml 的 interface.display_name。

一个组可以服务多个事项（`bmad` 同时覆盖 E2 与 E5），因此不按 Skill 逐个归属事项——
组内互相调用，拆组会拆断。

## 边界

| 面 | 回答 | 承载 |
| --- | --- | --- |
| 选型面 | 该用哪个 | [`plugins/docs/skills-overview.md`](../../plugins/docs/skills-overview.md)（13 个） |
| **资产面（本页）** | **我有哪些组、归哪、打包没有、健康吗** | 本工具（82 个 / 12 组） |
| 装配面 | 某个配置引用了什么 | `configs` 与其 SQLite（运行时权威） |
| 安装态 | 运行端实际装了什么 | `tools/plugin_release`（本机事实） |

本页只读版本化来源。字节是实测，其余全部是声明态；**不证明任何组在任一运行端已安装或生效。**

## 当前缺口

共 63 个 Skill / 10 个组，递归维护面 859,734 字节。

| 缺口 | 数量 | 含义 |
| --- | ---: | --- |
| 未打包（Claude 侧） | 1 | 无 plugin.json／不在两份 Marketplace，因而无版本号；OMP 侧不受影响——它本就不走 plugin 道 |
| 未归组 | 0 | 归组规则未覆盖，需在 matters.json 声明 |
| 外来组改动状况未核实 | 0 | 不知道是 fork 还是 vendor，升级会静默丢改动 |
| 外来组无更新触发条件 | 0 | 上游发新版没人知道，等于不更新 |
| 已打补丁的 vendor 组 | 1 | 升级前必须先重打补丁或把改动推回上游 |
| 组内有成员缺最少复核步骤 | 0 | 复核只能从零重判 |
| 组内有成员复核过期（> 30 天） | 0 | 有认知但已超过节拍 |
| description 解析失败 | 0 | frontmatter 写法超出已知三种 |

缺口为空不代表健康，只代表本工具能检出的项目已满足。

## 组总览

| 组 | 成员 | 维护面 | 占比 | 版本 | Claude 打包 | 服务事项 | 来源 | 本地改动 |
| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| **Issue 与 PR** `github-collaboration` | 6 | 124.1 KB | 14.8% | 0.3.18 | 是 | E3 推进仓库事项 | own | — |
| **问题求解治理** `adaptive-problem-solving` | 1 | 133.8 KB | 15.9% | 0.2.13 | 是 | X 横切面（不满足独立验收判据，不单独立事项） | own | — |
| **多席协作** `orchestrated-collaboration` | 1 | 50.2 KB | 6.0% | 0.2.7 | 是 | X 横切面（不满足独立验收判据，不单独立事项） | own | — |
| **资源观测** `resource-observability` | 1 | 9.7 KB | 1.2% | 0.2.4 | 是 | X 横切面（不满足独立验收判据，不单独立事项） | own | — |
| **自我改进** `self-improvement` | 1 | 16.0 KB | 1.9% | 0.1.7 | 是 | X 横切面（不满足独立验收判据，不单独立事项） | own | — |
| **Skill 维护** `skill-maintenance` | 1 | 6.5 KB | 0.8% | 0.1.1 | 是 | E4 管 Skill 本身 | own | — |
| **Skill 鉴别** `skill-appraisal` | 1 | 10.2 KB | 1.2% | 0.2.0 | 是 | E4 管 Skill 本身 | own | — |
| **知识维护** `knowledge-maintenance` | 1 | 6.3 KB | 0.8% | 0.1.3 | 是 | E4 管 Skill 本身 | own | — |
| **盘问** `grilling` | 1 | 3.9 KB | 0.5% | 0.1.2 | 是 | X 横切面（不满足独立验收判据，不单独立事项） | **vendor** 84fdeffd12f2ee307994d1eb6feb48173b6e0502（2026-08-06） | **1 处** |
| `bmad` | 49 | 478.8 KB | 57.0% | **无** | **否** | E2 造软件、E5 想清楚一件事 | **fork** v6.11.0（2026-08-24 核实为上游当前最新版） | 零 |

来源三分：`own` 我们自己写的，随便改，没有上游；`fork` 从外部拿来直接用，承诺零本地改动，更新＝拉上游新版；`vendor` 从外部拿来但打了补丁，必须登记每处改动，上游更新后需重新打补丁。kind 与 dependsOn 是两回事：一个 own 组可以依赖外部工具版本（如 openspec 组依赖 @fission-ai/openspec 1.9.0）。dependsOn 的 updateTrigger 是该组的失效条件之一，与 kind 无关。

**`fork` 的零改动是可机械验证的，不是一句声明**：内容指纹与上游 ref 不符即承诺已破，
必须转 `vendor` 或把改动推回上游。名义 fork、实际改过的组，下次升级一定丢改动且无人知晓。

### Issue 与 PR · github-collaboration

服务事项 **E3** 推进仓库事项　来源 `own`　已打包 v0.3.18

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `issue-contract-compaction` | `plugins/github-collaboration/skills/issue-contract-compaction` | 481 B | 8.6 KB | 0.0 KB | 2026-08-15 | 有 | 有 |
| `issue-delivery` | `plugins/github-collaboration/skills/issue-delivery` | 554 B | 15.2 KB | 0.0 KB | 2026-08-15 | 有 | 有 |
| `issue-workflow` | `plugins/github-collaboration/skills/issue-workflow` | 658 B | 23.6 KB | 36.5 KB | 2026-08-15 | 有 | 有 |
| `objective-to-issues` | `plugins/github-collaboration/skills/objective-to-issues` | 491 B | 13.0 KB | 0.0 KB | 2026-08-15 | 有 | 有 |
| `operating-ledger-maintenance` | `plugins/github-collaboration/skills/operating-ledger-maintenance` | 749 B | 11.5 KB | 0.0 KB | 2026-08-15 | 有 | 有 |
| `pr-integration` | `plugins/github-collaboration/skills/pr-integration` | 581 B | 15.6 KB | 0.0 KB | 2026-08-15 | 有 | 有 |

### 问题求解治理 · adaptive-problem-solving

服务事项 **X** 横切面（不满足独立验收判据，不单独立事项）　来源 `own`　已打包 v0.2.13

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `adaptive-problem-solving` | `plugins/adaptive-problem-solving/skills/adaptive-problem-solving` | 946 B | 9.2 KB | 124.6 KB | 2026-08-25 | 有 | 有 |

### 多席协作 · orchestrated-collaboration

服务事项 **X** 横切面（不满足独立验收判据，不单独立事项）　来源 `own`　已打包 v0.2.7

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `orchestrated-collaboration` | `plugins/orchestrated-collaboration/skills/orchestrated-collaboration` | 876 B | 21.3 KB | 28.9 KB | 2026-08-15 | 有 | 有 |

### 资源观测 · resource-observability

服务事项 **X** 横切面（不满足独立验收判据，不单独立事项）　来源 `own`　已打包 v0.2.4

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `resource-observability` | `plugins/resource-observability/skills/resource-observability` | 608 B | 5.6 KB | 4.1 KB | 2026-08-15 | 有 | 有 |

### 自我改进 · self-improvement

服务事项 **X** 横切面（不满足独立验收判据，不单独立事项）　来源 `own`　已打包 v0.1.7

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `self-improvement` | `plugins/self-improvement/skills/self-improvement` | 673 B | 8.8 KB | 7.2 KB | 2026-08-15 | 有 | 有 |

### Skill 维护 · skill-maintenance

服务事项 **E4** 管 Skill 本身　来源 `own`　已打包 v0.1.1

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `skill-maintenance` | `plugins/skill-maintenance/skills/skill-maintenance` | 334 B | 4.3 KB | 2.2 KB | 2026-08-16 | 有 | 有 |

### Skill 鉴别 · skill-appraisal

服务事项 **E4** 管 Skill 本身　来源 `own`　已打包 v0.2.0

> 判定一个组该不该收、归哪些事项、替代谁，并留下下次复核的最小步骤。与 skill-maintenance 相邻不重叠：本组产出判定，那组执行维护；判定为「改造后收」时 drive 到它。2026-08-24 随 plugins/ 数量门退役一并落地——那个门按资产数量计却以运行上下文成本为理由，而资产数量不等于装配数量。

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `skill-appraisal` | `plugins/skill-appraisal/skills/skill-appraisal` | 781 B | 10.2 KB | 0.0 KB | 2026-08-25 | 有 | 有 |

### 知识维护 · knowledge-maintenance

服务事项 **E4** 管 Skill 本身　来源 `own`　已打包 v0.1.3

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `knowledge-maintenance` | `plugins/knowledge-maintenance/skills/knowledge-maintenance` | 644 B | 6.3 KB | 0.0 KB | 2026-08-15 | 有 | 有 |

### 盘问 · grilling

服务事项 **X** 横切面（不满足独立验收判据，不单独立事项）　来源 `vendor`　已打包 v0.1.2

- 上游 https://github.com/mattpocock/skills
- ref `84fdeffd12f2ee307994d1eb6feb48173b6e0502（2026-08-06）`
- 许可 MIT，本地副本 plugins/grilling/LICENSES/mattpocock-skills-MIT.txt
- 上次同步 2026-08-08
- 更新触发 UPSTREAM.md 的「后续上游回顾规则」：只比较两个已采用的上游文件与根许可证，先固定新候选提交再逐项判断是否仍适用；不得自动合并覆盖本地正文

**本地改动 1 处——升级前必须先重打补丁或推回上游：**

- 16 条逐项改造已登记于 plugins/grilling/UPSTREAM.md：6 条保留、4 条修改（正文改中文并作为唯一权威、触发改为需明示同意、不强制派发子 Agent、relentlessly 改为按价值控成本）、6 条新增（问询前同意守卫、拒绝后不得重提、表达约束、降级与退出交接、完成交接定义、Codex 调用政策）

> 外来组登记得最完整的一个——有上游 pin、逐文件 Git blob 与 SHA-256、许可证本地副本、逐条改造记录和回顾规则。可作为 vendor 组的模板。

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `grilling` | `plugins/grilling/skills/grilling` | 351 B | 3.9 KB | 0.0 KB | 2026-08-15 | 有 | 有 |

### bmad

服务事项 **E2** 造软件｜**E5** 想清楚一件事　来源 `fork`　**未打包**

- 上游 https://github.com/bmad-code-org/BMAD-METHOD
- ref `v6.11.0（2026-08-24 核实为上游当前最新版）`
- 装于 2026-08-21
- 上次同步 2026-08-22
- 更新触发 上游发布高于 v6.11.0 的版本。零改动承诺成立，可直接拉新版，不需要重打补丁。

**本地改动：零**（fork 承诺成立）

> 跨两个事项：造软件主链在 E2，brainstorming／deep-recon／forge-idea／prfaq／advanced-elicitation／party-mode 属 E5。不按 Skill 拆——组内互相调用（bmad-help 路由、deprecated 转发），拆组会拆断。2026-08-24 撤回了此前唯一一处本地改动（sprint_status.py 的 --set-epic-status，65 行）：该能力上游本就有，在 sprint_plan.py generate --set KEY=STATUS，此前查错了脚本；回退后与安装态一字不差。2026-08-25 起按 vendor 内容跟踪一份于 vendor/bmad/skills/（49 个 Skill、243 个文件），不再按客户端投影成两份：负责人裁定本仓要的是「clone 即可用、不依赖安装步骤」，vendor 一份同时满足零安装与不重复；装配由 configs 承担，客户端原生发现目录不再承载字节。

| Skill | 位置 | L1 | L2 | L3 | 上次复核 | 失效条件 | 最少复核步骤 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `bmad-advanced-elicitation` | `vendor/bmad/skills/bmad-advanced-elicitation` | 204 B | 4.9 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-agent-analyst` | `vendor/bmad/skills/bmad-agent-analyst` | 124 B | 4.4 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-agent-architect` | `vendor/bmad/skills/bmad-agent-architect` | 114 B | 4.4 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-agent-dev` | `vendor/bmad/skills/bmad-agent-dev` | 143 B | 4.5 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-agent-pm` | `vendor/bmad/skills/bmad-agent-pm` | 132 B | 4.4 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-agent-ux-designer` | `vendor/bmad/skills/bmad-agent-ux-designer` | 99 B | 4.4 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-architecture` | `vendor/bmad/skills/bmad-architecture` | 283 B | 13.7 KB | 5.8 KB | 2026-08-24 | 有 | 有 |
| `bmad-brainstorming` | `vendor/bmad/skills/bmad-brainstorming` | 134 B | 9.5 KB | 19.8 KB | 2026-08-24 | 有 | 有 |
| `bmad-build` | `vendor/bmad/skills/bmad-build` | 292 B | 0.9 KB | 1.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-build-auto` | `vendor/bmad/skills/bmad-build-auto` | 74 B | 0.7 KB | 1.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-checkpoint-preview` | `vendor/bmad/skills/bmad-checkpoint-preview` | 189 B | 3.1 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-code-review` | `vendor/bmad/skills/bmad-code-review` | 138 B | 3.9 KB | 1.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-correct-course` | `vendor/bmad/skills/bmad-correct-course` | 118 B | 13.3 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-create-architecture` | `vendor/bmad/skills/bmad-create-architecture` | 61 B | 2.9 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-create-epics-and-stories` | `vendor/bmad/skills/bmad-create-epics-and-stories` | 106 B | 5.0 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-create-prd` | `vendor/bmad/skills/bmad-create-prd` | 52 B | 2.8 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-create-story` | `vendor/bmad/skills/bmad-create-story` | 114 B | 23.0 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-customize` | `vendor/bmad/skills/bmad-customize` | 183 B | 6.5 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-deep-recon` | `vendor/bmad/skills/bmad-deep-recon` | 758 B | 9.1 KB | 27.4 KB | 2026-08-24 | 有 | 有 |
| `bmad-dev-auto` | `vendor/bmad/skills/bmad-dev-auto` | 75 B | 1.9 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-dev-story` | `vendor/bmad/skills/bmad-dev-story` | 114 B | 26.2 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-document-project` | `vendor/bmad/skills/bmad-document-project` | 122 B | 1.2 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-domain-research` | `vendor/bmad/skills/bmad-domain-research` | 57 B | 1.8 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-edit-prd` | `vendor/bmad/skills/bmad-edit-prd` | 52 B | 2.9 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-editorial-review` | `vendor/bmad/skills/bmad-editorial-review` | 39 B | 1.1 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-editorial-review-prose` | `vendor/bmad/skills/bmad-editorial-review-prose` | 39 B | 0.5 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-editorial-review-structure` | `vendor/bmad/skills/bmad-editorial-review-structure` | 39 B | 0.7 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-forge-idea` | `vendor/bmad/skills/bmad-forge-idea` | 222 B | 10.1 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-generate-project-context` | `vendor/bmad/skills/bmad-generate-project-context` | 126 B | 0.8 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-help` | `vendor/bmad/skills/bmad-help` | 189 B | 4.5 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-market-research` | `vendor/bmad/skills/bmad-market-research` | 57 B | 1.8 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-party-mode` | `vendor/bmad/skills/bmad-party-mode` | 297 B | 9.4 KB | 19.8 KB | 2026-08-24 | 有 | 有 |
| `bmad-prd` | `vendor/bmad/skills/bmad-prd` | 104 B | 13.8 KB | 8.7 KB | 2026-08-24 | 有 | 有 |
| `bmad-prfaq` | `vendor/bmad/skills/bmad-prfaq` | 181 B | 10.5 KB | 16.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-product-brief` | `vendor/bmad/skills/bmad-product-brief` | 116 B | 11.4 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-project-context` | `vendor/bmad/skills/bmad-project-context` | 198 B | 8.3 KB | 7.5 KB | 2026-08-24 | 有 | 有 |
| `bmad-qa-generate-e2e-tests` | `vendor/bmad/skills/bmad-qa-generate-e2e-tests` | 123 B | 5.5 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-quick-dev` | `vendor/bmad/skills/bmad-quick-dev` | 70 B | 1.9 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-retrospective` | `vendor/bmad/skills/bmad-retrospective` | 234 B | 13.1 KB | 26.9 KB | 2026-08-24 | 有 | 有 |
| `bmad-review` | `vendor/bmad/skills/bmad-review` | 357 B | 7.4 KB | 24.3 KB | 2026-08-24 | 有 | 有 |
| `bmad-review-adversarial-general` | `vendor/bmad/skills/bmad-review-adversarial-general` | 39 B | 0.4 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-review-edge-case-hunter` | `vendor/bmad/skills/bmad-review-edge-case-hunter` | 39 B | 0.5 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-review-verification-gap` | `vendor/bmad/skills/bmad-review-verification-gap` | 39 B | 0.4 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-spec` | `vendor/bmad/skills/bmad-spec` | 277 B | 16.8 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-sprint-planning` | `vendor/bmad/skills/bmad-sprint-planning` | 312 B | 5.1 KB | 9.2 KB | 2026-08-24 | 有 | 有 |
| `bmad-sprint-status` | `vendor/bmad/skills/bmad-sprint-status` | 62 B | 2.3 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-technical-research` | `vendor/bmad/skills/bmad-technical-research` | 60 B | 1.8 KB | 0.0 KB | 2026-08-24 | 有 | 有 |
| `bmad-ux` | `vendor/bmad/skills/bmad-ux` | 145 B | 10.4 KB | 13.9 KB | 2026-08-24 | 有 | 有 |
| `bmad-validate-prd` | `vendor/bmad/skills/bmad-validate-prd` | 54 B | 2.9 KB | 0.0 KB | 2026-08-24 | 有 | 有 |

## 复核依据

15 条复核依据，覆盖 63/63 个 Skill。复核按下列步骤做，不重判。

### bmad

组级 · 覆盖 49 个成员｜来源 `appraisals.json · groups.bmad`｜上次复核 2026-08-24

**什么会让它失效** 上游 bmad-code-org/BMAD-METHOD 发布高于 v6.11.0 的版本；或本仓再次出现对 vendor/bmad/skills 的本地改动（fork 承诺零改动，一旦有改动即降级为 vendor）。

**下次最少复核步骤** ① 对 vendor/bmad/skills 与上游 v6.11.0 的内容做比对，有差异即 fork 承诺已破（此前的「两份副本互比」判据已随单份 vendor 化于 2026-08-25 退役）。② 查 https://github.com/bmad-code-org/BMAD-METHOD/releases 是否有高于 v6.11.0 的版本。③ 升级后跑 uv run vendor/bmad/skills/bmad-retrospective/scripts/tests/test_sprint_status.py，Windows 基线为 87 passed / 4 failed；那 4 个失败（atomic_write_preserves_mode、unreadable_target、symlinked_target、write_failure_restore）全部源于 Windows 没有 POSIX 权限语义，与本仓无关，多出任何失败才需下钻。

**本次判定依据** 2026-08-24 核实：epic-1-retro-item-5 声称的『无法写入 epic 级状态』不成立。sprint_plan.py（bmad-sprint-planning，epic 键的真正属主）自 v6.11.0 起就有 generate --set KEY=STATUS，docstring 明写 the repair path is allowed to downgrade，_parse_sets 用 classify_key + RANKS[kind] 按 epic 词表校验。已 dry-run 验证 --set epic-3=done 返回 explicit_set 且零写入。此前加在 sprint_status.py（bmad-retrospective）的 65 行是功能重复且放错脚本，已于本次全部回退。注意：generate --set 会从 epics.md 重新生成，当前会 drop 5 条 epics.md 未覆盖的 story 键——那是本仓 epics.md 与 sprint-status.yaml 的漂移，不是 bmad 的问题。

### adaptive-problem-solving

单个 Skill · 组 `adaptive-problem-solving`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-25

**什么会让它失效** 方法登记面的证据等级分布与登记面 README 声明不符；或三端 description 可见预算的实测基线（2026-08-11 测得 1000 UTF-8 字节）被新的实测推翻；或 INDEX 的「与装配内其他 Skill 的分界」表所列执行流程承载者（bmad-brainstorming、bmad-advanced-elicitation、bmad-forge-idea、bmad-party-mode、bmad-deep-recon、grilling）的 description 触发面发生变化，使该表的对应关系不再成立。

**下次最少复核步骤** 逐卡取当前能力证据等级，与登记面 README 的 M0／M1 计数比对。再对 INDEX 分界表逐行确认对方Skill 仍存在且其 description 仍覆盖该方法（grep 触发词即可），不需要读正文。三端 description 回显需要交互式观察运行端目录，不在本步内：预算门本身已由符合性测试守住，重测只在怀疑运行端截断行为变化时才做。

### grilling

单个 Skill · 组 `grilling`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** 明示同意门被取消，或运行端改为按关键词自动进入长期盘问。

**下次最少复核步骤** 确认触发路径仍要求用户直接请求或明确接受建议，且因剩余价值低或成本过高的退出门仍在。

### issue-contract-compaction

单个 Skill · 组 `github-collaboration`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** GitHub Issue 正文、评论、updatedAt 或恢复快照语义变化，使写前快照、最终重读或正文排他所有权不能可靠防止覆盖当前合同。

**下次最少复核步骤** 选择一条有评论的 Issue，演练只读压缩计划：确认当前正文、全部评论、恢复快照载体、最终重读字段和八项保留项仍可定位。

### issue-delivery

单个 Skill · 组 `github-collaboration`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** Draft PR、证据评论、分支所有权或 GitHub 交付复核语义变化，使单个已就绪 Issue 不能按合同形成可独立核验交付物。

**下次最少复核步骤** 对一个已就绪 Issue 复核范围恢复、分支所有权、Draft PR 或证据评论创建、远端回读和交付事实返回仍完整可执行。

### issue-workflow

单个 Skill · 组 `github-collaboration`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** GitHub Issue 子树生命周期、负责人决定、关闭授权或 Project 投影的权威规则变化，使本 Skill 的唯一生命周期决定者边界不再成立。

**下次最少复核步骤** 用一个真实或夹具 Issue 子树核对叶子判定、段结果返回、负责人动作消费、关闭授权和父级回收仍只由 issue-workflow 判定。

### knowledge-maintenance

单个 Skill · 组 `knowledge-maintenance`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** agent-control/authority/01-knowledge.md 的两道准入门或可信门八项条件发生变化。

**下次最少复核步骤** 读一次该权威，逐条比对价值门与可信门八项和正文引用是否一致。

### objective-to-issues

单个 Skill · 组 `github-collaboration`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** GitHub 原生 sub-issue、label、ProjectV2 item 或任务图分类规则变化，使父子图创建和分类投影不能按正文复核。

**下次最少复核步骤** 用一个目标 Issue 只读核对标题前缀、类型 label、父子关系、Project 条目与状态字段的现行 API 和正文映射仍一致。

### operating-ledger-maintenance

单个 Skill · 组 `github-collaboration`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** 经营总账 Project、Status 字段、负责人动作投影或跨 Session 观察面规则变化，使本 Skill 不能只维护观察面而不成为权威源。

**下次最少复核步骤** 读取当前经营总账 Project 和一条代表 Issue，确认诉求、计划、交付、等待负责人和完成状态的投影仍能按现行规则只读复核。

### orchestrated-collaboration

单个 Skill · 组 `orchestrated-collaboration`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** 所选协调后端（当前 orca orchestration）的 Run／Task／Dispatch 语义或标准释放回执格式变化；或其唯一原则源 agent-control/authority/05-resource-operations.md 的资源投入原则变化，使 R1–R6 派发门失去依据。

**下次最少复核步骤** 对一个真实 Run 取一次 task-list 与 worker-list，确认派发合同字段与释放证明可取；并读一次 authority/05 的资源投入原则，确认 R1–R6 投影仍成立且链接指向当前仓而非已冻结的老仓。

### pr-integration

单个 Skill · 组 `github-collaboration`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** GitHub PR 的 draft、review、required checks、merge state、评论主体或合并授权语义变化，使当前 head 绑定和整合门不再可靠。

**下次最少复核步骤** 对一个 PR 读取当前 head、Draft 状态、审查、required checks、冲突、mergeability 和评论作者类型，确认整合判断字段仍可获得。

### resource-observability

单个 Skill · 组 `resource-observability`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** orca account list --json 的返回结构变化：顶层 ok、result.rateLimits.claude／codex 的 status 与 updatedAt，或 usedPercent／windowMinutes／resetsAt／rateLimitResetCredits 这些窗口字段不再按 Skill 正文描述提供。

**下次最少复核步骤** 跑一次 orca account list --json，确认 ok 为真、两个 Provider 的 status 与 updatedAt 可读、上述窗口字段仍存在且量纲未变。

### self-improvement

单个 Skill · 组 `self-improvement`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-15

**什么会让它失效** 入口、Skill、任务记录三个改进承载面之一消失或职责变更，使路由判据指向不存在的去向。

**下次最少复核步骤** 逐个确认三个去向仍可写入，并各找出一个近期实例。

### skill-appraisal

单个 Skill · 组 `skill-appraisal`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-25

**什么会让它失效** 组作为判定单位的前提变化：装配层不再按组声明能力（configs 的 stable_config_revision.skills_json 或 OMP 的 skills.customDirectories／includeSkills 语义改变），使「判定一个组」不再对应任何可装配的单位；或来源三分（own／fork／vendor）的判据——是否允许本地改动——不再能机械验证；或装配白名单语义被改成黑名单，使「改装配声明」不再是有效处置。

**下次最少复核步骤** ① 读 tools/skill_registry/matters.json 的 assemblyAuthority 与 formNote，确认装配仍是白名单、且 OMP 实测结论仍与 omp config 的 skills.* 键一致。② 对任意一个 fork 组跑一次它自己的最少复核步骤，确认零改动仍可机械判定。两步都通过则本 Skill 的三种进入、五道门与处置顺序继续成立。

### skill-maintenance

单个 Skill · 组 `skill-maintenance`｜来源 `plugins/tests/workflow-routing.json`｜上次复核 2026-08-16

**什么会让它失效** Skill 的发现入口、版本声明、复杂度预算、生成物、评估合同／校验汇总工具或发布／退役工具发生变化，使正文盘点面和 clean cutover 步骤不再覆盖真实运行路径。

**下次最少复核步骤** 选择一个当前 Skill 做不写入审计，逐项确认行为合同、全部调用者、两端发现入口、版本、生成物、预算、评估合同和独立审查出口仍能按正文定位。

## 认知来源

每个 Skill 的失效条件与最少复核步骤只有一个来源，不在两处重复：

| 范围 | 来源 |
| --- | --- |
| `plugins/` 内 | `plugins/tests/workflow-routing.json` 的 `skillLifecycle` |
| `plugins/` 外 | `tools/skill_registry/appraisals.json` |

组边界、服务事项与归组规则来自 `tools/skill_registry/matters.json` 的显式声明。
归组是判断而非推导（`plugins/` 下目录名即组名除外）；工具只套用已声明的规则，
套不上就标未归组，不猜。

**失效条件应挂在组上，不是逐个 Skill。** vendored 组（如 `bmad` 49 个成员）的失效
来自上游版本，全组共享同一条失效条件与同一次复核——写一次，不是写 49 次。
当前 `skillLifecycle` 仍是逐 Skill 结构，这是已知的建模落后项。

# 多 Session 共享写入试验记录

> 状态：非权威研发记忆。保存可复查的“问题—证据—决定—实验—资产”关系；保存不等于可信、权威或授权。

## 1. 原始问题

任意新 Session 可以在不知道其他 Session 已经工作的情况下修改同一工作目录、分支、当前任务、权威、Agent 配置、Plugin 安装或 Orca 状态。负责人要求直接试用 `adaptive-problem-solving`，用低成本方式解决这个冲突。

目标不是把所有任务强制串行，也不是建设完整调度平台，而是让共享写入在发生前可以发现所有权；独立任务仍能安全并行。

## 2. 问题拆分

这不是一个单一 Git 问题：

1. 仓内文件冲突：可以用不同 worktree／分支隔离；
2. 集成冲突：同一分支提交、推送和合并仍需一个所有者；
3. 方向冲突：`work/current.md`、权威和整合决定需要单写者；
4. 系统资源冲突：用户级配置、入口、Plugin 安装缓存和 Orca 状态不受 Git worktree 隔离；
5. 可发现性：新 Session 在第一次写入前必须知道其他占用，而不是等待 Git 冲突后再恢复。

## 3. 三个候选

| 候选 | 收益 | 主要缺口 | 本轮判断 |
|---|---|---|---|
| 纯版本化文件 | 跨 Session 可读、可审计、可随 Git 恢复 | 不能证明 Session 是否在线；登记表本身会并发写；没有消息和交付生命周期 | 拒绝作为完整方案 |
| 纯 Orca | 有在线终端、Run、Task、Dispatch、Delivery 和跨 Session 消息 | 不推断文件／资源重叠；浮动终端可能没有工作区身份；旧 Run 不等于活跃占用 | 拒绝作为完整方案 |
| 混合 MVP | 入口保证写前检查，Orca 提供活跃协调，worktree 提供文件隔离，单写者保护共享状态 | 仍依赖 Agent 遵守规则；没有强制锁；近同时抢占只能事后收敛 | 当前选择 |

## 4. 当前最小合同

只有以下两项同时成立才认为资源被占用：

- 协调者 Session 仍在线；
- Run／当前任务／Dispatch 明确列出它拥有的资源范围。

旧 Run、已完成 Task、单独存在的终端或 TUI 显示的 `Ready` 都不能单独证明所有权。

写入者公布范围后，在首次写入前复查一次。若近同时出现多个重叠声明，较早建立且仍在线的协调者保留所有权，其他 Session 退回只读并通知协调者。没有 Orca 时，用当前任务文件指定一个写入者；无法判断就改为单 Session。

## 5. 实验过程

### E01：基线盘点

- 本轮开始时有两个 Codex Session 可以触及 `agent-control`；
- 主 Session 是 Orca 浮动终端，`terminal list` 没有显示其实际工作目录；
- 旧 Run `run_d6bfb82e9782` 仍绑定主 Session，但六个任务全部完成；
- 结论：终端、工作区和 Run 三类状态都不能单独承担资源所有权。

### E02：建立本轮占用

- 创建 Run `run_8f829c43983e`；
- Run 目标明确列出 `agent-control`、`agent-plugins` 和三端安装状态的单写协调者；
- 同一范围写入同时写入 `work/current.md`，让新 Session 从稳定入口恢复后可以定位活跃后端。

### E03：复用旧 Session 的失败

- `worker-start --terminal` 无法认领一个 Orca 可见且可写的旧 Codex 终端，返回 `selector_not_found`；
- 低层 Dispatch 成功注入，但旧 Session 为寻找 Orca CLI 花费数分钟；它最终退出 Codex，未发送 `worker_done`；
- 协调者没有把超时当失败，也没有关闭或重建用户 Session；确认进程退出后，把任务显式记为失败；
- 未观察到该 Session 对受保护文件的新增修改；
- 结论：终端可见不等于可被监督复用，Dispatch 建立也不等于交付闭环成立。

### E04：行为资产实施

- Agent 系统入口增加“共享写入前置检查”的短触发；
- `orchestrated-collaboration` `0.1.2` 增加活跃占用、重叠处理、二次复查和 worktree 边界；
- 普通 Codex、Orca Codex 与 Claude 安装副本和源码哈希一致；
- 没有创建锁服务、注册表、Hook、MCP 或自动调度器。

### E05：全新 Session 反事实验证

状态：通过。

- 全新 Codex 在同一 worktree 中只读恢复当前任务；
- 面对“修改 `work/current.md` 和用户级 Plugin”的反事实请求，它识别出 `run_8f829c43983e`、唯一协调者、自己的只读 Task／Dispatch 和全部重叠范围；
- 它明确选择加入现有协调但保持只读，要求由协调者转移或重新分区后才能写；
- 它正确说明新 worktree 不能授予当前任务／权威的方向所有权，也不能隔离仓外 Plugin 安装；
- `filesModified` 为空，协调者复核两个 Git 仓只有预期实现和记录改动；
- 临时终端完成后被精确关闭，Delivery 已确认。

### E06：协调工具的附带发现

- 浮动协调者调用 `worker-start --worktree current` 无法解析工作树；
- 即使提供 `id:` 或 `path:` 精确选择器，`worker-start` 在本次环境仍返回 `selector_not_found`；
- 低层 `terminal create` + `dispatch --inject` 可以完成任务，但这种 Dispatch 不进入 `worker-list`，`worker-release` 返回 `dispatch_not_found`，只能由协调者精确关闭自己创建的临时终端；
- 这些是 Orca `1.4.177` 的当前自然使用证据。它们影响协调成本和恢复方式，但不改变本轮共享写入合同，也不足以决定 Fork、自建或放弃 Orca。

## 6. 知识候选与准入

候选结论：在当前本机 Orca 环境中，“系统入口触发 + 当前任务公布范围 + Orca 活跃协调者 + worktree 文件隔离”比纯文件或纯 Orca 更接近最低可用闭环。

当前不把它写成当前知识，原因是：

- 只有一次自然任务和一次行为验证；
- 还不知道不同启动方式、Claude、Orca 更新和协调者意外退出时的恢复成本；
- 没有数据证明它比简单单 Session 在日常任务中节省多少人工成本。

未来至少一次自然复用无需重新读本记录、能够避免真实重叠写入，才考虑通过价值门；届时还要重新核验 Orca 版本与失效条件，才能通过可信门。

## 7. 暂不建设与升级触发

本轮不建设常驻锁、原子租约服务、自动 Session 注册、Hook、调度器或跨主机平台。

只有出现以下任一真实证据才重新比较：

- 两次以上因 Agent 忘记前置检查而发生重叠写入；
- 同时启动导致两个协调者在二次复查前都已经写入；
- 多个独立根任务无法由单一 `work/current.md` 和一个协调 Run 表达；
- Orca 不可用或跨供应商 Session 无法发现活跃协调者；
- 人工检查的平均成本接近或超过冲突返工成本。

## 8. 负责人纠正：本轮解决了衍生问题，不是原始协作问题

在准备把混合 MVP 更新为协作权威并发布 `agent-control` 时，负责人指出本轮发生了更高层的问题漂移：

- 负责人想要的是多个 Agent／Session 大规模、低成本地共同推进长程工作；
- `issue-to-merge` 已经展示了 Issue 拆分、计划、实现、PR、审查和合并循环等协作产能；
- 本轮却把“共享工作区会碰撞”当成主目标，最终只证明了新 Session 会拒绝写入；
- 这个结果可能提高安全性，却也可能增加检查和串行成本，不能凭一次拒写验证声称协作能力改善。

被替代的判断：冲突保护可以单独代表多 Session 协作 MVP。

新的问题关系：

```text
原始目标：低对齐成本的多 Agent 长程执行能力
  ├─ 产能：拆分、并行、交付、审查、合并、恢复
  ├─ 控制：任务身份、方向、授权、优先级、负责人决定
  ├─ 运行：Session、模型、工具、环境、消息和可观测性
  └─ 安全属性：隔离、单写入、冲突发现和回退
```

本轮只实现并验证了最后一项的一部分。它是否值得保留，要和产能收益、判断成本及更完整方案一起比较。

### 根因诊断

- **问题漂移**：权威把共享冲突登记为“下一优先问题”后，Agent 把这个衍生问题误当成完整产品目标；
- **对齐缺口**：Agent 给出了自己的问题定义和候选方案，却没有让负责人确认“该定义是否覆盖原始协作诉求”，只让负责人批准了解法；
- **验收错位**：实验只观察“会不会拒绝危险写入”，没有观察“能否让更多独立工作同时推进、减少负责人介入或降低交接成本”；
- **方法执行缺口**：`adaptive-problem-solving` 虽要求恢复原始问题，但本次只恢复了当前子问题，没有检查子问题完成后对父目标的实际贡献。

### 当前影响

- 停止更新协作权威和发布 `agent-control`；
- `orchestrated-collaboration` `0.1.2` 已在纠正前提交并推送，暂记为待复核安全补丁，不冒称完整 MVP；
- 下一步先对齐完整协作产品，再判断保留、缩窄或回退当前补丁；
- 候选长期改进：问题求解治理在子问题立项和验收时增加“父目标贡献检查”，但当前不立即修改 Skill，避免再次未经对齐实施。

## 9. 完整协作目标获得确认

负责人确认纠正后的完整协作模型符合原始意图，并进一步纠正了对 GitHub 的过窄定位：

- GitHub 不只用于代码持久化和合并，它完全可以成为规划、协调、派发、状态、审查和整合的候选主干；
- `issue-to-merge` 与 Orca 都是冷启动阶段先安装、先试用的外部候选，不得因为已经存在就成为长期依赖；
- `issue-to-merge` 需要重新审计和设计，可以吸收其有效行为建设自有实现，之后废弃外部 Plugin；
- 下一步应先证明哪些协作能力可以低成本复用 GitHub，再判断 Orca、自有 Skill 或更重的自建系统还需要补什么。

这次确认使原冲突保护试验正式结束为“安全属性证据”，当前任务转入完整协作 MVP 的受限方案审计。

## 10. 受限审计：GitHub 可以是协作主干

### 窄问题与范围

本次只回答：完整协作 MVP 中，GitHub、`issue-to-merge` 和 Orca 分别可以承担什么，是否已经足以选出一条最小验证路线。对象为 2026-08-09 的 GitHub 官方能力、本机 `gh 2.97.0`、安装的 `issue-to-merge 0.1.0` 以及 Orca `1.4.177`。

当前没有已认可的公共知识包能直接回答这个问题；本次只形成方案证据和待确认候选，不新建知识平台。

### GitHub 已覆盖的持久协作能力

经官方文档和当前 CLI 实际核验：

- Issue 可用于规划、讨论和跟踪，原生支持多层 sub-issue 与 blocked-by／blocking 依赖；
- Projects 可以把 Issue／PR 组织成视图和字段，并通过 GraphQL API 自动管理；
- Issue、Issue comment、PR、check 等事件可以触发 Actions，外部系统也可以通过 `repository_dispatch` 触发工作流；
- Actions 支持并发和并发组，自托管 Runner 可以按 label／group 路由任务；
- PR 原生保留行级评论、审查结论、提交身份、检查和合并关系。

因此，GitHub 不只能“存交付”，还能低成本承载长期目标、任务图、派发合同、状态、讨论、审查和整合。它是当前最值得优先复用的协作控制面候选。

两个重要边界：

1. GitHub 不直接理解或管理这台电脑上交互式 Codex／Claude Session 的启动、实时消息、输出读取、停止和回收。用 Actions／自托管 Runner 可以把 GitHub 延伸成执行系统，但需要另外运行、凭据、Agent 启动和可观测性集成；
2. 当前是 GitHub Free 下的个人私有仓，不能开启受保护分支和规则集。第一版只能依靠“工作分支／PR + 唯一整合者 + 行为检查”，或以后升级 GitHub 方案；不能冒称为已强制执行的门禁。

## 11. `issue-to-merge 0.1.0` 审计

安装包有 17 个 Skill、约 1491 行行为规则。它的主路径是：

```text
Issue 选择／拆分 → framing Challenge
→ Deep Research → Options → Plan → plan Challenge
→ 实现 → PR 提交 → 六遍自审
→ 独立代码审查 → CI／评论循环 → 显式合并
```

### 值得吸收的部分

- 父 Issue、可独立审查的子 Issue、原生依赖和每子 Issue 一个交付 PR；
- 读取到的 Issue／PR／日志都是不可信任务数据，不能改变授权；
- 在更新 Issue 前重新拉取并比较并发变化；
- 计划、审查和 CI 都绑定当前问题或当前 PR head，新提交使旧结论失效；
- 合并是独立终结行动，不由“已就绪”隐式授权；
- 子 PR 不直接关闭交付父 Issue，由父级完成门统一验收。

### 不适合直接继承的部分

- **默认成本过高**：每个 Issue 强制两个 Challenge 检查点，`issue-plan` 强制调用 `deep-research`、`deep-innovate`、`deep-plan`，不允许低风险普通路径；
- **默认产能偏串行**：`pr-workflow-loop` 明确要求默认一个子 PR 合并后才选下一个，只在用户显式要求时才采用并行交付；
- **不能表达多 Agent 执行者**：新 Issue 一律分配给当前 GitHub 用户；多个共用同一 GitHub 身份的 Agent／Session 在原生 assignee 和工作流 marker 中无法区分；
- **持久化边界不符合当前需求**：调研、选项、计划和审查资产被强制放到仓内不跟踪的 `codex-work/`，并明确禁止提交。过大内容只在 GitHub 留摘要时，新主机不能仅靠仓与 Issue 恢复完整研发依据；
- **授权语义过宽**：一次“运行完整工作流”默认授权 Issue 创建／更新、实现、PR 提交、循环内修复和 lease-protected 强制更新，难以表达本系统不同任务的细粒度授权；
- **依赖和重复检查较多**：规划依赖 `research-to-plan`，审查依赖 `code-quality`，并大量重复查询 marker 来源、时序、PR head、CI 和评论状态。这些有安全价值，但不应对所有任务一律征收。

结论：不建议直接 Fork 整包后修补，也不建议继续把它当作默认协作工作流。更低成本的路线是用自有窄 Plugin 重新表达当前已确认需求，只吸收上述经验证的局部行为。此结论仍是待负责人确认的方案建议。

## 12. Orca 的增量价值

Orca `1.4.177` 当前能提供 GitHub 不直接拥有的本地／跨主机运行层：Session／终端启动，任务 DAG，Dispatch，持久消息，ask/reply，decision gate，受监督 Worker，typed `worker_done`，有界读取、停止、放弃和回收。它能显著降低当前 Windows 上人工启动和跟盯多个 TUI 的成本。

但 Orca 不应再次复制 GitHub 的长期目标和交付状态。当前最小边界应是：

- GitHub 是持久协作控制面和恢复入口；
- Orca Run／Task 只保留活跃执行期所需的 Session 生命周期，并显式链接 GitHub Issue／PR；
- Agent 不得从旧 Orca Run 恢复产品方向，交付完成后以 GitHub 状态为准；
- 没有 Orca 时，同一 GitHub Issue 合同仍可以被 Codex／Claude 手工领取和恢复。

## 13. 选项与当前推荐

| 路线 | 产能 | 实时性 | 建设／维护成本 | 退出与锁定 | 当前判断 |
|---|---|---|---|---|---|
| GitHub 主干 + 手工启动 Session | 中到高 | 低 | 低 | 低 | 可用普通路径，但多 Session 跟盯成本仍高 |
| **GitHub 主干 + Orca 薄运行适配** | **高** | **高** | **中** | **中低** | **当前推荐的可逆 MVP** |
| GitHub Actions + 自托管 Agent Runner | 高 | 中 | 高 | 中 | 当前证据不支持先做 |
| 自建完整协作／调度平台 | 未知／上限高 | 高 | 很高 | 取决于设计 | 暂缓 |

推荐的第一个完整 MVP：

1. 父 Issue 表达长程目标、整体边界、负责人决定点和完成门；
2. 子 Issue 表达可独立交付的工作片，使用原生 sub-issue 和 blocked-by 构成可并行任务图；
3. 协调者是 Issue 任务合同的唯一写入者，Worker 用评论交付、提问和报告阻塞，避免多个 Agent 竞争改写同一 Issue 正文；
4. 每个子 Issue 的派发合同至少包含执行者／Session 身份、分支或 worktree、写入边界、授权、交付、停止和升级条件；
5. 互不依赖的子 Issue 可同时分配给多个 Session，每个交付独立分支／PR；
6. Orca 只把这些 GitHub 合同启动为实时 Worker，并回传消息和终结结果；GitHub 始终是恢复入口；
7. 每个 PR 在当前 head 上做独立复核，由一个整合者按依赖合并，最后用父 Issue 完成门验收。

工作流载体建议不是直接 Fork `issue-to-merge`，而是在自有 `agent-plugins` 中建设一个窄 Plugin：普通工作默认走轻路径；只在风险、不确定性或决定价值支持时，由 `adaptive-problem-solving` 升级到调研、攻防、选项、Challenge 或更强验证。先保留外部 Plugin 作为对照，自有工作流完成一次真实交付后再决定卸载。

上述全部是待负责人确认的候选，不是已授权实施。

## 14. 负责人纠正：方案没有可审阅的独立载体

在 Agent 用聊天总结请求负责人批准时，负责人指出：正在准备推出一个产品和架构方案，但负责人没有一个集中、可直接阅读的方案位置，导致审阅困难。

断点不是方案完全没有被写下，而是它被分散在：

- 聊天中的推荐和批准问句；
- `work/current.md` 中的任务状态和摘要；
- 本研发记录中的证据、过程和方案理由。

这三种载体都不应单独代替“等待审阅的完整方案”。被替代的行为是：完成研发记录和任务摘要后，直接在聊天中请求负责人批准重要方案。

最小改进：

- 在 `work/proposals/` 新建独立、非权威的方案审阅面；
- `work/current.md` 只提供唯一方案链接和决定状态；
- 本次建立 `work/proposals/2026-08-09-collaboration-mvp.md`，把原问题、完整方案、替代方案、边界、成本、风险、实施、验收和待确认决定放在同一份文件；
- 在负责人审阅前停止把“可以批准”当成已授权实施。

可跨任务复用的行为缺口是：重要方案进入人的决定点前，必须先形成可单独审阅的方案载体。本次先把该规则放入当前权威仓的 `README.md`，不在未授权时顺手修改共享 Skill 或用户级入口。

## 15. 负责人纠正：审阅面应是 GitHub 资产

负责人进一步指出，本地方案文件仍然难以访问和审阅；独立载体不等于合适的审阅载体。

这替代了第 14 节中“以 `work/proposals/` 文件作为默认审阅面”的做法。根因是 Agent 只解决了信息集中问题，没有从负责人的实际审阅路径检查可访问性、评论能力和版本记录。

最小修正：

- 在 `Eridanus117/agent-control` 创建 GitHub Issue [`#1`](https://github.com/Eridanus117/agent-control/issues/1)，正文承载完整待审方案；
- `work/current.md` 只链接这个 GitHub 资产；
- 删除被替代的本地方案草稿，不再要求负责人打开本地文件；
- 仓库规则改为：纯方案默认使用 GitHub Issue；已有仓库差异需要逐行审阅时使用 Draft PR。

Issue 的创建只改变审阅媒介，不表示方案已经确认，也不授权实施。

## 16. 方案批准并进入受限实施

负责人于 2026-08-10 回复“批准”。结合 Issue [#1](https://github.com/Eridanus117/agent-control/issues/1) 明确列出的决定与授权草案，本次解释为：第 11.1–11.4 节全部确认，并授权第 12 节的受限实施。

Issue [#1](https://github.com/Eridanus117/agent-control/issues/1) 已更新批准状态、记录批准来源并以 `completed` 关闭。当前进入新的实施任务图；批准不包含默认自动合并，也不包含 Actions Runner、强制锁、独立登记中心、Hook 或常驻自动调度器。

实施任务图建立在 `Eridanus117/agent-plugins`：父 Issue [`#8`](https://github.com/Eridanus117/agent-plugins/issues/8)，三个原生子 Issue [`#9`](https://github.com/Eridanus117/agent-plugins/issues/9)、[`#10`](https://github.com/Eridanus117/agent-plugins/issues/10)、[`#11`](https://github.com/Eridanus117/agent-plugins/issues/11)。三个交付分别拥有 Plugin 元数据与 `objective-to-issues`、`issue-delivery`、`pr-integration` 的不重叠文件范围。

## 17. 首批真实并行派发

协调者继续使用已有且仍绑定当前终端的 Orca Run `run_8f829c43983e`，没有创建竞争 Run。`agent-plugins` 主工作区在派发前为干净的 `main`。

第一次尝试使用 `worker-start --worktree new-top-level` 时，新登记仓库返回两次 `selector_not_found`，均未创建 worktree 或 Dispatch。协调者按 Orca 当前指南降级为低层等价路径：先用 `worktree create --no-parent --agent` 创建三个独立顶层 worktree，再等待 TUI 就绪并用 `dispatch --inject` 绑定已有 Task。Claude 首次启动停在工作区信任提示，协调者只对本次用户自有 `agent-plugins` worktree 确认信任。

有效来源链：

| Issue | Worker | Task | Dispatch | 分支／worktree |
|---|---|---|---|---|
| `#9` | Codex | `task_5693885d62b1` | `ctx_62428d4988aa` | `Eridanus117/gh-collab-objective`／`gh-collab-objective` |
| `#10` | Claude | `task_0929a2260c64` | `ctx_367f8ce43d25` | `Eridanus117/gh-collab-delivery`／`gh-collab-delivery` |
| `#11` | Codex | `task_ad1b1c877ac9` | `ctx_f13cc5587a4f` | `Eridanus117/gh-collab-integration`／`gh-collab-integration` |

三个 Dispatch 已验证存在且指向预期执行者；GitHub 子 Issue 评论同步了 Run、Task、Dispatch、分支、worktree、文件所有权和 Draft PR 交付合同。

## 18. 首批并行交付、独立审查与投入产出

三个子任务于 2026-08-10 05:05:49 UTC 同时建立 Task。Claude 的 `issue-delivery` 在 05:14:00 完成首轮 Draft PR，Codex 的 `pr-integration` 在 05:17:13 完成，Codex 的 `objective-to-issues` 在 05:20:31 完成。三个 Worker 都从 GitHub 子 Issue 和当前权威恢复合同，只修改各自拥有的路径，并分别交付：

- [`agent-plugins#14`](https://github.com/Eridanus117/agent-plugins/pull/14)，`objective-to-issues`，已审查 head `070f7345c86f87849cd6f2fb02ff3fc80f2108ca`；
- [`agent-plugins#12`](https://github.com/Eridanus117/agent-plugins/pull/12)，`issue-delivery`，已审查 head `070efe6307f6635dbcad6fc9d3856b97eda14e26`；
- [`agent-plugins#13`](https://github.com/Eridanus117/agent-plugins/pull/13)，`pr-integration`，已审查 head `beae79383f6c7e759ffc20633abf139c6388618a`。

独立审查发现一项真实阻断：`#12` 初版把“远端 Issue 与本地文件、聊天记录或协调状态冲突时以 Issue 为准”写成无条件优先级，可能使过期 Issue 覆盖当前权威、授权或负责人之后的明确指令。协调者没有直接修 Worker 分支，而是建立第二个 Claude Task `task_f80760c361e0`，限定同一 worktree 和文件范围完成修正。它在 05:21:18 交付新 head；复审确认 Issue 现在只优先于聊天记忆、本地草稿和运行期协调状态，权威冲突会保持只读并升级裁决。

协调者随后从干净的 `origin/main` 建立一次性临时 worktree，按 `#14`、`#12`、`#13` 的内容组合三个精确提交。Claude Plugin 和 Marketplace 严格验证通过；Codex／Claude manifest 内容一致；三个 Skill 均存在；`git diff --check` 通过。临时 worktree 已回收。三个 PR 当时均为 open、Draft、GitHub 报告可合并，但三个 head 都没有 CI status，因此只能声称静态和组合验证通过，不能声称 CI 绿色。

### 自然可观察的收益

- 三个独立切片同时推进，首轮交付墙钟约 15 分钟；如果只按本轮各 Worker 用时相加，串行执行约 34 分钟，尚未计入串行切换时间。这个比较只说明本样本的并行等待收益，不代表长期平均吞吐；
- 两个 Codex 和一个 Claude 都遵守排他路径，主工作区和共享分支没有出现写入碰撞；
- GitHub 父／子 Issue、评论、分支、PR 和提交形成了可跨 Session 读取的持久来源；Orca 让协调者在一个 Run 中收到跨模型完成回传；
- 负责人批准实施后没有为三个切片分别对齐或批准，唯一返工由独立审查发现并在 Agent 闭环内完成。

### 可见成本、失败和限制

- Orca 高层 `worker-start` 对新登记仓库两次返回 `selector_not_found`；本轮按当前指南改用低层 worktree、Task、Dispatch 路径。低层 Dispatch 没有可用的 Worker show／release 记录，协调者需要按精确终端手工关闭；
- Claude 第一次进入新 worktree 需要一次工作区信任确认；
- 一个切片发生一次语义返工，修正 Task 用时约 6 分钟；这同时证明独立审查有价值，也说明首轮 Worker 自检不能代替整合审查；
- 三个 Worker 共用负责人的 GitHub 身份，GitHub 原生评论和 Review 不能单独证明是哪一个 Agent 执行；本轮依靠 Issue 中的 Orca Task／Dispatch／分支合同补足来源；
- 当前没有可靠 Token、费用或各模型额度数据，也没有为一次复盘新建高成本观测系统；
- 本轮证明了 Worker 能从 GitHub 合同启动并通过 PR 交付，但还没有完成“协调 Session 停止后由全新协调 Session 只依据 GitHub 恢复并继续整合”的强恢复测试。

### 当前 ROI 判断和停止点

当前证据支持继续完成这个可逆 MVP：并行交付和跨模型跟盯的收益已经可见，且一次真实审查缺陷被闭环修复。它仍不足以支持把 Orca 确认为永久依赖、卸载 `issue-to-merge`，或建设 Actions Runner、强制锁、独立登记中心、Hook、常驻调度器。

按已批准的实施边界，本轮停止在合并决定点。推荐合并顺序为 `#14 → #12 → #13`：先落 Plugin 元数据和 Marketplace，再落两个不重叠的 Skill。当前未授权合并、安装、关闭父／子 Issue 或升级后续能力。

## 19. 整合闭环、跨 Session 恢复与最终 ROI 停止点

负责人明确批准：按 `#14 → #12 → #13` 完成整合；安装 `github-collaboration` 到普通 Codex、Orca Codex 和 Claude；用全新 Session 验证从 GitHub 恢复；通过后关闭 `#8–#11` 并更新当前记录。同时继续排除自动化、永久依赖和卸载决定。

### 精确提交整合

协调者在每次合并前重新检查 PR 当前 head、关闭目标、未解决审查线程、检查状态和合并状态，并只合并已经审查的精确提交：

| 顺序 | PR | 已审查 head | squash 合并提交 | 结果 |
|---|---|---|---|---|
| 1 | [`#14`](https://github.com/Eridanus117/agent-plugins/pull/14) | `070f7345c86f87849cd6f2fb02ff3fc80f2108ca` | `715a2559ce8fd22be97265a51099a5c3991c170f` | 合并并关闭 `#9` |
| 2 | [`#12`](https://github.com/Eridanus117/agent-plugins/pull/12) | `070efe6307f6635dbcad6fc9d3856b97eda14e26` | `1185b53d59b09b812485664ed3d16b5cde067dbc` | 在基础分支变化后等待重新计算为可合并，再合并并关闭 `#10` |
| 3 | [`#13`](https://github.com/Eridanus117/agent-plugins/pull/13) | `beae79383f6c7e759ffc20633abf139c6388618a` | `ffbb4548bf0a0055dbf00b26ef73d8cd2643c8d0` | 合并并关闭 `#11` |

仓库没有配置 CI／status checks，因此这里的结论仍是“没有 CI 检查”，不是“CI 绿色”。合并后的 `main` 通过 Claude Plugin 严格验证、Marketplace 严格验证和 `git diff --check`。

### 三端安装证据

`github-collaboration 0.1.0` 已安装并启用到：

- 普通 Codex：`C:\Users\<user>\.codex\plugins\cache\agent-plugins\github-collaboration\0.1.0`；
- Orca Codex：`C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home\plugins\cache\agent-plugins\github-collaboration\0.1.0`；
- Claude：`C:\Users\<user>\.claude\plugins\cache\agent-plugins\github-collaboration\0.1.0`。

两个 Codex 环境的 Plugin 列表都报告 `installed: true`、`enabled: true`、版本 `0.1.0`；Claude Plugin 列表报告相同版本、用户级启用。源码和三份缓存均含 8 个文件，逐文件 SHA-256 和字节数完全一致。这个证据证明安装和 Marketplace 发现状态，不替代每个端各自的新 Session 行为测试。

### 全新 Session GitHub 恢复验收

协调者建立独立恢复 worktree 和 Orca Task `task_efdf3ba6c55c`／Dispatch `ctx_2b70b7a86be7`。新 Orca Codex Session 不能把旧协调上下文或本地工作记录当成动态交付状态，只能从当前权威和 GitHub 恢复；任务还要求显式使用 `pr-integration`，除在 `#8` 留一条验收评论外保持只读。

新 Session 成功发现三个 `github-collaboration` Skill，从 GitHub 恢复父子 Issue、三个 PR 的当前 head／审查／合并提交、批准评论和 `main` 内容，并发布了[恢复验收评论](https://github.com/Eridanus117/agent-plugins/issues/8#issuecomment-5236363034)。协调者再用独立 GitHub 读取复核评论与远端事实一致。Worker 没有修改文件、配置、分支或 Plugin，也没有合并、关闭或创建对象；唯一副作用是已授权评论。随后终端关闭、`worker_done` 交付确认，四个干净的交付／恢复 worktree 通过 Orca 正常回收。

### 反向证据与 ROI

恢复链功能成立，但还不够轻：从 05:36:29 UTC 派发到 05:46:06 UTC 完成约 9 分 37 秒；Worker 首先尝试了本机 PATH 中不存在的 `gh`，之后才改用 GitHub App／页面；还读取了超过本任务所需的入口和工具说明，并重复核验部分事实。协调者在中途通过 Orca 发出 5 分钟时间盒和最小事实集提示。这些不是阻断，但说明普通恢复路径仍有明显判断与工具成本。

本轮因此得到一个有限而可行动的结论：

- GitHub 作为持久任务图和跨 Session 恢复入口已经通过真实样本；
- 多 Agent 并行、跨 Codex／Claude 交付和独立审查产生了可见产能收益；
- Orca 提供的实时派发、消息和回收有增量价值，但高层 selector、低层生命周期、环境差异和恢复路径偏重仍有摩擦；
- 自有轻量 Plugin 值得进入自然使用观察，但当前证据不支持继续加功能，也不支持把它或 Orca 定为永久依赖；
- 普通 Codex 和 Claude 本轮只完成安装／启用／内容一致性验证，只有全新 Orca Codex 完成了端到端恢复行为验收；
- 不卸载 `issue-to-merge`，不建设 Actions Runner、强制锁、登记中心、Hook、自动调度器或新的观测系统。

整合完成后，父 Issue `#8` 的三项子交付、三端安装和新 Session 恢复完成门均已满足；[最终验收评论](https://github.com/Eridanus117/agent-plugins/issues/8#issuecomment-5236404717)已发布，`#8` 以 `completed` 关闭。本任务在这里结束。下一次只在自然使用产生足够证据时重新进入 ROI 决定，而不是为证明系统而继续造系统。

## 20. 整合后纠正：轻量化删除了必要质量门

负责人恢复 Session 并加载实际 Skill 后指出，上一节的完成判定和最终交接发生了劣化：负责人没有一个可直接看到完整 ROI 的 GitHub 决策面；最终总结只说明 Agent 做了什么，没有说明当前产品判定和接下来想做什么；更重要的是，新自有工作流虽然没有照搬 `issue-to-merge` 的高成本默认流程，却也没有稳定保留其“Issue 是否值得做”、提交后 Self Review 和独立 Peer Review 三项有效质量门。

重新对照源码确认：

- `objective-to-issues` 检查建图价值和子任务资格，但不完整挑战 Issue 本身的必要性、问题定义与 `defer`／`recommend-close` 路径；
- `issue-delivery` 有相称验证，但明确排除强制自审循环，没有独立的提交后 Self Review 门；
- `pr-integration` 能核验当前 head、反馈和合并授权，但没有要求一个独立执行者使用结构化 Peer Review 和明确 verdict；本次独立审查是协调者临时组织，而非工作流稳定路径；
- 父 Issue `agent-plugins#8` 的关闭评论只含压缩后的 ROI，不足以支撑负责人直接做产品决定。

因此，“0.1.0 已完成，可以直接进入自然观察”的旧判断被替代。当前判定是 **`revise`**：`github-collaboration 0.1.0` 只是已验证的协作骨架，不是完整默认工作流，也不是 `issue-to-merge` 的成熟替代品。

负责人批准的最小纠偏没有修改 `agent-plugins`。协调者创建并验证了 GitHub 决策 Issue [`agent-control#2`](https://github.com/Eridanus117/agent-control/issues/2)，集中展示真实收益、成本、证据质量、缺失质量门、四种替代路线与推荐的临时混合基线。推荐先组合复用现有 `issue-challenge`、`pr-self-review`、`pr-review` 与自有三个协作 Skill，用少量自然任务观察思考税和发现价值，再决定吸收、继续组合或退出；这仍是待负责人确认的产品建议，不是已授权默认流程。

当前停止：只等待负责人在 `#2` 决定 `revise` 判定、临时混合基线和观察后再投资的路线；不实现 0.2，不卸载 `issue-to-merge`，不恢复自动化或永久依赖事项。

## 21. 负责人批准 ROI 决定，并要求 Agent 自主发现同类缺口

负责人批准了 `agent-control#2` 的三个决定：接受 `revise`；采用 `issue-challenge`、`pr-self-review`、`pr-review` 与自有协作 Skill 的临时混合基线；先通过少量自然任务观察，再决定自有 0.2、继续组合或退出。决定已经写入 [#2 评论](https://github.com/Eridanus117/agent-control/issues/2#issuecomment-5236598145)，`#2` 以 `completed` 关闭。

负责人同时指出一个更高层的行为缺口：能力回退和 ROI 审阅面缺失不应由负责人事后发现，而应由 Agent 主动发现。这替代“只要给负责人一个更好的总结／审阅面就足够”的窄修正。

根因诊断：

- 子 PR 审查只证明实现满足子 Issue，不能证明子 Issue 的集合完整覆盖父目标；
- 协调者同时参与问题建模、任务拆分、验收与总结，最终只检查既定计划是否完成，没有另一个 Agent 在父目标层攻击遗漏；
- 当前 `adaptive-problem-solving` 会检查原始问题和替代路线，但没有显式要求在产品验收时比较当前基线／参考能力的回退、证据等级和负责人可见 ROI；
- 当前系统规则要求重要方案在实施前形成 GitHub 审阅面，却没有对实施后的产品采用／ROI 决定提出同等不变量。

最小可逆资产是 GitHub 行为改进候选 [`agent-control#3`](https://github.com/Eridanus117/agent-control/issues/3)。它推荐“系统入口主动触发 + `adaptive-problem-solving` 详细检查 + 高价值父任务独立复核”，不新建 `product-review` Skill 或评测平台。该 Issue 已分配给负责人，但当前只是一项待批准实施的提案；没有修改系统入口、Skill 或 `agent-plugins`。

当前停止在一次决定：是否批准 `#3` 推荐路线 C 的范围受限行为补丁。临时混合基线已经生效，0.2、卸载外部 Plugin 和自动化事项继续暂缓。

## 22. 负责人批准路线 C，首次按临时混合基线进入实施

负责人再次确认 `agent-control#2` 的三项决定全部成立，并批准 `agent-control#3` 推荐路线 C 的范围受限实施。授权评论位于 [#3](https://github.com/Eridanus117/agent-control/issues/3#issuecomment-5236677100)：系统／项目入口增加主动触发；`adaptive-problem-solving` 增加父目标贡献、能力回退、证据等级和负责人可见 ROI；只有高价值多 PR Agent 系统能力或工作流替代需要独立父级复核；不新建 Skill、Hook、评测平台、锁、登记中心、调度器或资源监控。合并仍单独绑定最终精确 head 和明确授权。

本次也是已批准临时混合质量基线的第一次自然使用。`issue-challenge` 的 framing 结论为 [`proceed`](https://github.com/Eridanus117/agent-control/issues/3#issuecomment-5236685399)；受限 Research、Options 和 Plan 已依次写入 Issue；plan Challenge 最终为 [`proceed`](https://github.com/Eridanus117/agent-control/issues/3#issuecomment-5236709139)。Challenge 没有改变路线 C，但发现并修正一个运行所有权问题：`work/current.md` 是新 Session 的共享状态，不能交给功能 PR Worker，也不能等 PR 合并后才记录授权；因此本协调者在主分支先更新当前状态，再派发两个不重叠的功能切片。

本次计划使用两个 PR：`agent-plugins` 修改 `adaptive-problem-solving` 与 `orchestrated-collaboration` 的现有正文、版本和双端包装；`agent-control` 只修改版本化入口及仓内投影。每个 PR 先提交后自审，再由不同 Agent 审查当前 head；两个最终 head 还要由未参与拆分和实现的 Agent 做一次父目标级只读复核。未合并版本不安装，完成上述门后停止在负责人精确 head 合并决定点。

当前对临时基线成本的观察：Challenge 与三阶段计划主要重新表达了已经很完整的 `#3`，没有改变产品路线；唯一新增信息是上述共享状态所有权澄清。这部分墙钟和重复阅读将作为是否收紧旧 `issue-to-merge` 组合流程的真实成本证据，不因此再追加方法或评测系统。

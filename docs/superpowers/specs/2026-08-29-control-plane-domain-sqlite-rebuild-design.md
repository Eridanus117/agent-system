---
title: "control-plane Domain 与 SQLite 重构设计规格"
status: review
created: 2026-08-29
updated: 2026-08-29
driver: 负责人
approver: 负责人
contributors: "Codex"
informed: "control-plane 维护者、BMad 规划维护者"
scope: "agent-systemX / packages/control-plane / migrations"
assets: "packages/control-plane, migrations, 默认 control-plane SQLite"
---

# control-plane Domain 与 SQLite 重构设计规格

## 决策摘要

本规格选择“保留产品目标，重建实现架构”的方案：删除当前 `packages/control-plane` 中把 DTO、事实包装、查询投影、客户端能力探测和启动状态混在一起的 Domain API；以稳定配置、一次性激活和启动观察为当前核心模型；通过通用 `ClientAdapter` 接入 OMP 与 Claude；以单一 SQLite Store 和版本化迁移协议承接现有默认数据库中的全部可保留数据。

这不是在现有 API 上增加一层 facade，也不是继续给 `Fact<T>`、`LaunchPlan` 和 `application/ports.ts` 打补丁。旧 Domain API、旧 application port 聚合文件、客户端分支和整行覆盖写必须在迁移完成后删除；不保留兼容别名、deprecated API、shim 或双写路径。

当前激活能力限定为：

- 稳定配置修订与配置沿革；
- OMP 与 Claude 的配置装配；
- 一次性激活操作；
- 启动阶段观察；
- Harness 作为独立能力面和边界，不并入 control-plane Domain。

候选集、推荐、三层验证、Bad Case 产品化、opaque locator、lease/fencing、任务语义和更多客户端只保留为扩展点，不进入本轮核心模型。

本文件处于 `review`。它记录设计选择和执行边界；负责人书面批准前，不授权实现和 BMad 权威文档同步。

## 1. 决策卡

| 项目 | 内容 |
| --- | --- |
| Driver | 负责人 |
| Approver | 负责人 |
| Contributors | Codex；control-plane 维护者 |
| Informed | BMad 规划维护者；Harness 维护者 |
| 生命周期阶段 | 决策前设计审阅 |
| 影响范围 | `packages/control-plane`、`migrations`、测试、BMad architecture spine |
| 目标结果 | Domain、application、adapter、SQLite schema 各自拥有单一职责和单一事实边界 |
| 审批门 | 规格通过后，才进入实现计划和代码修改 |

## 2. 问题与约束

### 2.1 当前问题

当前 Domain 不是稳定的业务核心，而是多种不同职责的集合：

1. `domain/facts.ts` 以泛型 `Fact<T>` 把已知、未知、展示文本和相等比较塞进一个通用包装器。
2. `domain/config.ts` 把配置修订、能力引用、事实字段、查询比较结果和 supersedes 遍历放在同一文件。
3. `domain/activation.ts` 用一个 `LaunchPlan` 同时代表准备、确认、启动、进程失败和观察结果。
4. `domain/client.ts` 硬编码 `omp | claude-code | codex-cli`，并把运行时支持探测放进 Domain。
5. `application/ports.ts` 同时承载 repository、OMP、Claude、进程、materializer、Harness 和 CLI 相关 port，并反向导入 adapter 类型。
6. OMP 与 Claude 的 application flow 各自复制激活协调逻辑。
7. SQLite 配置 repository 和 launch repository 分别初始化迁移、使用独立连接，且 `launch_plan` 采用整行 upsert，没有版本条件。
8. 当前迁移 runner 没有 schema history，只通过表、列、trigger 和 projection 状态推断迁移状态。
9. 默认数据库实际存在当前迁移未声明的 `deployment_status`、`operation_status`、`operation_step`、`operation_resolution` 四组表，说明历史 schema ownership 已漂移。

### 2.2 已核实约束

- 当前产品权威来自 `_bmad-output/`，不是 `_archive/`。
- 当前产品不要求一次激活所有客户端；当前有效客户端是 OMP 与 Claude。
- 默认 SQLite 数据必须保留并迁移，不能通过删库规避迁移问题。
- 未知事实必须保持未知；迁移不得根据缺失数据伪造启动观察或成功证据。
- Harness 与 control-plane 是两个能力面；Harness 不并入 control-plane 内部 Domain 或 SQLite repository。
- SQLite 连接层现有 WAL、`busy_timeout`、外键和并发打开重试策略应保留。

### 2.3 真实数据库审计证据

默认 control-plane SQLite 当前观察到：

```text
stable_config              1 row
stable_config_revision     1 row
launch_plan                4 rows

deployment_status          0 rows
operation_status            0 rows
operation_step              0 rows
operation_resolution       0 rows
```

另外：

```text
PRAGMA user_version = 0
journal_mode = wal
```

4 条 `launch_plan` 中有 3 条失败记录，其中部分 `revision_id` 是 Bun 路径或空字符串；另有 1 条 `self` 配置成功记录。该事实不能被重解释为“所有失败都已启动后观察失败”，但必须在迁移中保留。

## 3. 目标与非目标

### 3.1 目标

1. 让 Domain 只表达稳定配置、激活操作、启动观察和明确的状态转换。
2. 删除通用 `Fact<T>`，避免泛型事实包装器侵入所有实体和持久化字段。
3. 将五组 capability 数组统一为一个有序的 `CapabilityReference[]` 集合。
4. 将 `ActivationOperation` 与 `LaunchObservation` 分成两个独立模型和两个独立持久化职责。
5. 让客户端差异进入通用 `ClientAdapter`，application 不再写 OMP/Claude 分支。
6. 将 application port 按能力拆分，删除 `application/ports.ts`。
7. 用单一 SQLite Store 承担连接、事务、migration history 和 repository 组装。
8. 使用条件版本写入，拒绝后写覆盖和非法状态回退。
9. 把旧数据库中的可保留记录、未知状态和孤立表显式纳入迁移结果。
10. 通过 contract、migration fixture、并发负例和真实 smoke 验证完整迁移。

### 3.2 非目标

- 不重新定义产品目标，不引入候选集、推荐或用户决策域。
- 不实现 lease、fencing、locator、任务生命周期或三层验证。
- 不把 Harness engine 并入 control-plane。
- 不替换 SQLite，不引入 ORM，不做数据库供应商抽象。
- 不在本轮激活 Codex、Cursor、Kimi、ZCode 或其他客户端。
- 不把查询比较结果、CLI rendering DTO 或 UI 状态继续放入 Domain。
- 不删除默认数据库中的未知表；第一轮迁移只盘点、保留并标记 owner unknown。
- 不通过兼容别名、deprecated 导出、双写或旧 API shim 延长旧架构生命周期。

## 4. 方案选项与权衡

| 维度 | 方案 A：在现有 Domain 上增量打补丁 | 方案 B：当前能力范围内 clean cutover | 方案 C：引入事件溯源或全新存储模型 |
| --- | --- | --- | --- |
| 近期改动量 | 最低 | 中等 | 最高 |
| 是否消除 `Fact<T>`、重复 flow 和客户端分支 | 否 | 是 | 是 |
| 现有数据迁移风险 | 表面较低，实际持续累积 | 可控，需显式复制与校验 | 高，需要全新恢复与回放协议 |
| 并发写入语义 | 继续整行覆盖 | 可增加 version/CAS | 可由事件序列表达，但复杂度显著增加 |
| 回滚可逆性 | 高但债务继续增长 | 中高：保留 legacy 副本和迁移 manifest | 首次上线风险最高 |
| 维护成本 | 高，职责继续混合 | 低于当前，边界可审计 | 高，超出当前产品需要 |
| 适配当前范围 | 表面兼容，根因不变 | 最匹配 | 过度设计 |
| 决策 | 否决 | **采用** | 否决 |

选择方案 B：它直接解决当前结构性问题，同时不引入当前产品不需要的事件溯源和外部数据库复杂度。

## 5. 目标架构

### 5.1 依赖方向

```text
CLI / composition root
        ↓
application use cases
        ↓
Domain
        ↑
application ports
        ↑
adapters: sqlite / OMP / Claude / process / filesystem
```

约束：

- Domain 不导入 Bun、SQLite、文件系统、进程、CLI、Harness 或客户端 adapter。
- application 只依赖 Domain 和拆分后的 ports，不依赖 adapter 实现类型。
- adapter 可以实现 port，可以使用 Domain DTO，但不能定义产品终态。
- CLI 负责组合根、参数解析和渲染，不负责状态转换和客户端流程编排。
- Harness 通过明确的边界调用 control-plane public application API，不共享内部 Domain 类型。

### 5.2 Domain 模块

目标结构：

```text
packages/control-plane/src/domain/
  configuration.ts
  capability.ts
  activation-operation.ts
  launch-observation.ts
  client.ts
  errors.ts
  index.ts
```

#### `configuration.ts`

拥有：

- `ConfigurationName`；
- `ConfigurationRevisionId`；
- `ConfigurationRevision`；
- revision lineage 和 supersedes 关系；
- 配置修订的不变量：名称、revision id、schema version、创建时间、能力引用集合有效。

不拥有：

- 查询用 `ComparisonResult`；
- UI 展示文本；
- FTS 结果；
- SQL row mapping；
- candidate 或 recommendation。

#### `capability.ts`

统一表示当前激活范围内的能力引用：

```text
CapabilityReference {
  kind: CapabilityKind
  name: string
  source: CapabilitySource
  summary: string | undefined
  contentFingerprint: string | undefined
}
```

`CapabilityKind` 当前允许 `instruction | skill | mcp | hook | plugin`。五类能力在 Domain 中统一存入有序集合；按 kind 分组只属于 query projection 或 adapter materialization。

`CapabilitySource` 是显式值对象，不再使用 `Fact<T>`。缺失 source 或 fingerprint 表达为字段未提供，只有当业务需要区分“明确未知”和“没有该字段”时，才使用命名明确的状态类型，不恢复通用 `Fact<T>`。

#### `activation-operation.ts`

`ActivationOperation` 只表示一次激活操作，不表示进程观察：

```text
ActivationOperation {
  operationId
  revisionId
  configName
  clientId
  phase
  version
  createdAt
  updatedAt
  terminalReason
}
```

阶段只描述 operation 自身：

```text
prepared
awaiting-confirmation
applying
succeeded
degraded
failed
cancelled
requires-restart
```

`observing` 从 operation 核心阶段删除。操作进入 `applying` 后，启动观察作为关联记录追加；是否终态由观察结果和 application policy 决定。

状态转换由命名 command 或 transition function 承担，非法转换返回明确 Domain error。Domain 不接受任意字符串 phase，也不允许 adapter 直接写终态。

#### `launch-observation.ts`

`LaunchObservation` 只表示客户端启动后的观察事实：

```text
LaunchObservation {
  observationId
  operationId
  clientId
  stage
  outcome
  processReference
  reason
  observedAt
}
```

当前 stage 最少支持：

```text
process-started
context-written
process-exited
outcome-observed
```

`processReference` 只保存受控引用或摘要，不保存 prompt、transcript、credentials、原始 tool payload 或未脱敏 stderr。

没有观察到进程启动时，不得写入 `process-started`；旧数据中 `observed_outcome = unknown` 不得迁移成失败观察。

#### `client.ts`

Domain 只保留不绑定具体客户端实现的 `ClientId` 值对象或字符串约束。不能在 Domain 中维护 `omp | claude-code | codex-cli` 的支持矩阵。

客户端是否支持、版本是否满足、是否能 materialize 配置、是否能启动进程，全部由 `ClientAdapter` 和其 capability probe 返回。

### 5.3 Application 用例

目标用例边界：

```text
prepareActivation
confirmActivation
rejectActivation
executeActivation
appendLaunchObservation
getActivationStatus
requestConfigurationSwitch
```

application 负责：

1. 读取 canonical aggregate；
2. 校验 operation 和 revision 关联；
3. 调用 `ClientAdapter` 的能力和执行合同；
4. 在副作用前确认授权、确认状态和版本；
5. 使用 repository 的条件写入；
6. 将 adapter 返回的启动事实转换为 `LaunchObservation`；
7. 返回 application read model，而不是 Domain entity 的任意 JSON。

application 不负责：

- OMP/Claude 专用分支；
- FTS 查询结果拼装；
- SQL row mapping；
- 生成默认配置来掩盖未知；
- 从客户端退出码推断完整业务成功。

`getActivationStatus` 可以按需要返回 operation、observation 和 adapter evidence 的查询 DTO，但该 DTO 不回流 Domain。

### 5.4 ClientAdapter 合同

目标 port：

```text
ClientAdapter {
  clientId
  probe(input): Promise<ClientCapability>
  prepare(input): Promise<PreparedActivation>
  start(input): Promise<StartedProcess>
  observe(input): Promise<ObservedLaunch>
}
```

语义约束：

- `probe` 只报告当前版本和能力，不修改产品状态。
- `prepare` 负责客户端特有的 materialization 或 invocation context 准备。
- `start` 只负责启动并返回可关联的受控进程引用。
- `observe` 只返回当前可观察事实；不可观察时返回显式 unknown/not-available。
- adapter 不创建 `ActivationOperation`，不决定 operation 终态，不直接写 SQLite。
- OMP 和 Claude 各自实现同一合同；客户端专用 materializer 是 adapter 内部细节。

### 5.5 Application ports 拆分

删除：

```text
packages/control-plane/src/application/ports.ts
```

拆分为窄 port：

```text
application/ports/configuration-repository.ts
application/ports/activation-operation-repository.ts
application/ports/launch-observation-repository.ts
application/ports/client-adapter.ts
application/ports/clock.ts
application/ports/identifiers.ts
application/ports/invocation-context.ts
```

repository 写入合同不再暴露 `save(entity)`：

```text
insert(operation)
updateIfVersion(operationId, expectedVersion, nextState)
append(observation)
findById(id)
```

条件失败必须返回 typed concurrency conflict；不能静默覆盖。
### 5.6 人机交互硬门

启动配置会创建 operation、可能启动外部进程并接管当前终端，属于高影响动作。交互必须把“浏览/选择”和“提交/执行”分开：

- TUI 列表中的 `Enter` 只能打开该修订版本的确认摘要，不得直接启动外部进程。
- TUI 确认摘要必须显示配置身份、客户端、将应用的能力、已知差异和终端交接后果；第二次明确确认才允许执行。
- `q` 和 `Esc` 必须提供不创建 operation 或不继续执行的路径；取消不能被解释成启动失败。
- 纯文本 CLI 的 `configs use` 与 `configs switch` 继续保留一次明确确认；`--yes` 是显式自动化入口，但不能隐藏摘要。
- `switch` 只能执行切换语义。不存在可切换的活跃 operation 或状态不允许切换时，必须返回明确错误；不得静默降级成普通 `use`。
- 每条恢复建议必须指向当前实际存在的命令，或明确说明当前无法自动恢复；禁止输出不存在的 `configs import`/`configs sync` 等动作。
- status read model 必须区分 operation 阶段和 launch observation 阶段，并给出用户下一步；不能只输出一个无法解释“进程是否启动”的 `phase`。
- TUI 与纯文本 CLI 对同一高影响动作的安全含义必须一致；入口可以不同，提交动作不能隐式降低确认等级。

因此，本轮 TUI 交互模型固定为：

```text
列表：↑↓ 选择，→/i 查看详情，Enter 打开确认摘要，q 退出
详情：Enter 打开确认摘要，Esc 返回，q 退出
确认：y/Enter 执行，n/Esc 取消
```

实现不得用“用户看过详情”替代“用户明确授权执行”。这条规则优先于减少一次按键。

## 6. SQLite 目标模型与迁移协议

### 6.1 单一 Store

新增唯一 SQLite 入口，职责为：

1. 打开一个数据库连接；
2. 设置现有 WAL、busy timeout、foreign keys 等连接策略；
3. 执行 schema migration；
4. 执行 projection reconciliation；
5. 提供事务边界；
6. 组装所有 SQLite repositories。

repository 构造函数不能自行执行 migration。配置 repository、writer 和 activation repository 必须共享 Store 的连接和事务边界。

### 6.2 schema history

新增：

```text
schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)
```

协议：

- schema history 是 schema 版本的唯一权威；
- migration 名称、版本和 checksum 必须匹配；
- 缺少前置 migration 时 fail closed；
- checksum 变化时 fail closed；
- 每个 migration 在独立事务中执行；
- `PRAGMA user_version` 可同步为快速诊断值，但不能替代 history；
- 已存在、但没有 history 的数据库先执行一次 legacy bootstrap，不伪造 `0001`～`0004` 的历史执行记录。

### 6.3 canonical 表

物理命名可以在实现计划中最终确定，但语义必须分离为：

```text
configuration
configuration_revision
activation_operation
launch_observation
schema_migrations
legacy_schema_inventory
legacy_launch_plan
```

核心约束：

- `configuration_revision` 保存一个统一的 `capabilities_json` 有序集合；
- `activation_operation` 保存 operation 当前状态、版本和 revision/client 关联；
- `launch_observation` 追加观察事实，不覆盖 operation 历史；
- `legacy_launch_plan` 保留旧 `launch_plan` 的完整可审计副本；
- `legacy_schema_inventory` 保存首次迁移发现的非 canonical 表、列和 owner 状态。

Search projection 独立于 schema migration：

```text
schema migration → canonical data validation → projection reconciliation
```

projection 重建失败不得伪装成 canonical data migration 成功。

### 6.4 现有数据迁移

第一轮迁移必须在数据库副本上完成，并生成 migration manifest。顺序：

```text
锁定输入文件
→ 创建副本/备份
→ legacy schema inventory
→ 创建 canonical 表
→ 复制 configuration 数据
→ 合并五组 capability JSON 为 capabilities_json
→ 复制可解析 revision lineage
→ 复制 launch_plan 到 legacy_launch_plan
→ 转换可关联 launch_plan 为 activation_operation
→ 仅从 observed_outcome=known 生成 launch_observation
→ 校验行数、主键、外键、hash 和未知状态
→ 重建 search projection
→ 写入 schema_migrations
→ 记录 manifest 与验证结果
```

数据规则：

1. 五组旧 capability 数组按旧字段顺序合并，保留每个引用的 `kind`，不改变内容语义。
2. 旧 `launch_plan` 全部先进入 `legacy_launch_plan`，确保无法映射的行也保留。
3. `revision_id` 无法关联 canonical revision 的旧计划标记为 `unresolved legacy operation`，不得伪造有效 revision 关联。
4. `observed_outcome = known` 才能生成 `outcome-observed`；`unknown` 只保留未知状态。
5. `phase = failed` 只表示旧 operation 记录的阶段，不生成进程失败观察。
6. 旧 `confirmed_at`、`failure_reason` 和 `observed_outcome` 的时间、值和未知原因必须保留在 legacy 副本或可追溯迁移记录中。
7. `deployment_status`、`operation_status`、`operation_step`、`operation_resolution` 第一轮不删除、不改写、不纳入当前 canonical repository；只进入 inventory，状态为 `owner-unknown`。

### 6.5 迁移回滚与恢复

SQLite 没有可靠的通用 down migration，因此本轮采用恢复优先策略：

- 原数据库在迁移前保持不变；
- 在副本上执行 migration；
- 迁移完成后执行完整验证；
- 只有验证通过才替换运行入口或写入切换标记；
- 验证失败时保留原文件和失败 manifest，禁止继续写入半迁移数据库；
- canonical 表和 legacy 表在至少一个稳定版本周期内同时保留；
- 未经 owner 确认，不删除未知表或 legacy 表。

## 7. 风险与控制

| 风险 | 表现 | 控制 |
| --- | --- | --- |
| 历史表来源不明 | 现有数据库含当前迁移未声明的表 | inventory；保留；owner unknown；禁止隐式删除 |
| 旧失败计划无法关联 revision | 路径或空字符串被写入 revision_id | legacy 副本；canonical 标记 unresolved；不伪造 FK |
| 观察语义被过度推断 | failed 被当作进程失败 | operation 与 observation 分离；只迁移明确 known outcome |
| 并发覆盖 | 两个进程后写覆盖状态 | version/CAS；冲突返回 typed error |
| migration 重复执行 | 重启造成重复列、重复数据或重复 projection | schema history、checksum、幂等 bootstrap |
| projection 掩盖 canonical 失败 | 搜索结果看似正常但主表迁移失败 | canonical validation 与 projection reconciliation 分离 |
| 旧 API 残留 | 新旧模型双轨写入 | 删除旧导出、旧调用者和 shim；结构搜索作为 gate |
| 客户端分支回流 application | OMP/Claude flow 再次复制 | ClientAdapter contract；application 只依赖通用 port |
| 测试只验证合成数据库 | 真实默认库升级失败 | 默认 DB 副本迁移 smoke；不直接改原库 |

## 8. 触达资产

| asset_id | relation | change_or_usage | scope | risk | verify | rollback |
| --- | --- | --- | --- | --- | --- | --- |
| `packages/control-plane/src/domain/*` | canonical Domain | 删除 `facts/config/activation/client` 混合 API，拆分配置、能力、operation、observation | 当前 control-plane | 业务语义回归、调用者遗漏 | domain contract tests、LSP references、结构 gate | 代码变更通过 git revert；不保留运行时 shim |
| `packages/control-plane/src/application/*` | application use cases | 删除 OMP/Claude 重复 flow，使用通用 ClientAdapter 和窄 repositories | OMP、Claude、switch、status | 客户端行为变化 | OMP/Claude real smoke、contract fixtures、status readback | 发布前保留旧数据库副本和可回退代码版本 |
| `packages/control-plane/src/adapters/clients/*` | client adapters | 将 Claude materializer/process 细节收回 adapter，实现通用合同 | OMP、Claude | context 或 argv 语义回归 | adapter contract、真实启动、失败观察 | 停止启用新 adapter 入口，恢复上一版本代码 |
| `packages/control-plane/src/adapters/sqlite/*` | persistence adapter | 单一 Store、schema history、CAS、独立 projection reconciliation | 默认 control-plane SQLite | 数据丢失、锁竞争、半迁移 | 副本迁移、行数/hash/未知状态校验、并发负例 | 使用原数据库副本和上一版本入口 |
| `migrations/*` | schema source | 新增 bootstrap、canonical copy、legacy inventory 和 observation 分离迁移 | 现有默认 DB 及新 DB | migration 不可逆 | migration manifest、重复执行、失败恢复 fixture | 不在原文件上执行；副本失败即丢弃 |
| `_bmad-output/planning-artifacts/architecture/**` | architecture authority | 规格批准后同步目标边界、结构和迁移协议 | BMad 当前权威文档 | 文档先于代码漂移 | 文档引用与代码结构 gate | 若规格未批准，不修改；批准后由新决策 supersede |
| `packages/harness-engine` | bounded external capability | 保持独立，不共享 control-plane Domain/SQLite | Harness | 边界侵入 | import boundary、package contract | 删除越界依赖 |

## 9. 实施顺序与门禁

### Stage 0：规格批准与基线

输入：本规格、当前 BMad SPEC、architecture spine、真实数据库审计结果。

必须完成：

- 负责人批准本规格；
- 锁定当前 branch/head；
- 保存默认数据库副本和 schema inventory；
- 记录当前 Domain/Application/SQLite 测试基线。

停止条件：权威文件冲突、数据库副本不可读取、存在未归属写入操作。

### Stage 1：Domain clean cutover

必须完成：

- 新 Domain 模块和不变量；
- 删除 `Fact<T>` 及其调用者；
- 删除旧 `ComparisonResult` Domain API；
- 分离 `ActivationOperation` 和 `LaunchObservation`；
- 删除硬编码客户端支持矩阵；
- 所有调用者迁移完成。

停止条件：仍有旧导出、旧 `Fact` 引用、旧 `LaunchPlan` 作为公开业务模型或未迁移 caller。

### Stage 2：Application 与 adapter 收口

必须完成：

- 删除 `application/ports.ts`；
- 迁移为窄 port；
- OMP/Claude 实现同一 `ClientAdapter` 合同；
- application 删除客户端分支；
- repository 写入改为 version/CAS 和 observation append。

停止条件：application import adapter 类型、adapter 直接写产品终态、仍存在 `save(entity)` 全量覆盖路径。

### Stage 3：SQLite migration cutover

必须完成：

- 单一 Store；
- schema history 和 checksum；
- legacy inventory；
- canonical copy；
- launch plan legacy preservation；
- operation/observation 分离；
- projection reconciliation 独立运行。

停止条件：原数据库被直接改写、未知表被删除、迁移后行数/hash/未知状态不一致、重复执行不幂等。

### Stage 4：真实行为验证

必须完成：

- OMP 一次性激活 smoke；
- Claude 一次性激活 smoke；
- 启动成功、启动失败、不可观察和未找到 revision 负例；
- 并发 CAS 冲突负例；
- 默认数据库副本升级和重启验证；
- Harness import boundary 验证。

停止条件：只能证明 typecheck/test 通过，不能证明真实客户端行为或数据迁移结果。

## 10. 验收标准

### Domain

- [ ] 不存在 `Fact<T>` 导出和生产调用者。
- [ ] `CapabilityReference[]` 是唯一 capability 集合模型。
- [ ] `ActivationOperation` 不包含 launch observation 字段。
- [ ] `LaunchObservation` 不承担 operation 状态转换。
- [ ] 查询比较结果不属于 Domain。
- [ ] Domain 不导入 Bun、SQLite、CLI、adapter 或 Harness。

### Application 与 adapter

- [ ] `application/ports.ts` 已删除。
- [ ] OMP 与 Claude 只通过通用 `ClientAdapter` 接入。
- [ ] application 没有按客户端复制的 activation flow。
- [ ] adapter 不直接写 operation 终态。
- [ ] 所有状态写入带 expected version，冲突不会覆盖。
### 人机交互

- [ ] TUI 的普通选择动作不会直接启动外部进程。
- [ ] TUI 在执行前展示确认摘要，并要求一次明确授权。
- [ ] TUI 与纯文本 CLI 对启动动作保持一致的安全含义。
- [ ] `switch` 条件不满足时返回明确错误，不静默降级成 `use`。
- [ ] 所有恢复建议都指向真实存在的命令或明确说明无法自动恢复。
- [ ] status 同时表达 operation 阶段、observation 阶段和用户下一步。
- [ ] 交互验证覆盖误触 Enter、取消、启动失败、不可观察和需要重启。

### SQLite

- [ ] 默认数据库副本可从无 migration history 状态完成 bootstrap。
- [ ] schema history 有版本、名称、checksum 和 applied time。
- [ ] 重复启动不会重复迁移或重复生成观察。
- [ ] `stable_config`、`stable_config_revision` 和 `launch_plan` 现有数据可追溯保留。
- [ ] 无法关联 revision 的旧 launch plan 不丢失、不伪造 FK。
- [ ] `observed_outcome=unknown` 不生成成功或失败观察。
- [ ] 四张未知历史表未被删除，且 inventory 标记 owner unknown。
- [ ] projection 失败不会掩盖 canonical migration 失败。
- [ ] CAS 并发负例可稳定复现并返回 typed conflict。

### 交付

- [ ] 当前 Domain、repository、adapter、integration 和 smoke 测试通过。
- [ ] 默认数据库副本迁移验证通过，原数据库未被直接改写。
- [ ] `_bmad-output` architecture 文档与实际代码边界同步。
- [ ] 无旧 API alias、deprecated path、双写或 TODO stub。

## 11. 被否决的替代方案

### 11.1 继续扩展 `Fact<T>`

否决原因：它把“已知/未知”“来源”“展示”“相等比较”混成泛型工具，导致所有新实体继续携带无关复杂度。命名明确的状态和可选字段更容易表达不变量，也更容易迁移和查询。

### 11.2 保留 `LaunchPlan`，只增加 observation 字段

否决原因：这会继续把 operation lifecycle、process lifecycle 和 outcome lifecycle 放在同一行。增加字段不能解决状态来源不同、时间不同和并发写入不同的问题。

### 11.3 只修改 migration runner，不改表模型

否决原因：schema history 能解决“迁移到哪里”，不能解决 `launch_plan` 语义混合、整行覆盖和未知表 ownership。必须同时完成 Domain 和 persistence contract cutover。

### 11.4 直接删库重建

否决原因：默认数据库已有实际配置修订、成功启动记录和失败尝试记录；删库会丢失可追溯证据，也会规避而不是解决迁移能力。

### 11.5 迁移到事件溯源

否决原因：当前产品只需要小规模配置和激活状态，事件溯源会增加回放、快照、幂等、版本和修复复杂度，不能证明对当前问题有足够收益。

## 12. Open questions

这些问题不阻塞本规格的主方向，但必须在实施计划中定值：

1. canonical 表最终采用新表名还是保留部分物理表名，以减少 SQLite 外键迁移成本。
2. `legacy_launch_plan` 和 `legacy_schema_inventory` 保留一个稳定版本还是永久保留。
3. `LaunchObservation.processReference` 的最小 allowlist 字段。
4. OMP 和 Claude adapter 的真实 `probe` 版本字段与不可观察错误码。
5. 是否把 schema history 的 manifest 复制到 repo-local evidence，还是只保存在 control-plane 状态目录。

这些 open questions 不能改变以下已冻结约束：数据保留、未知不伪造、operation/observation 分离、单一 Store、CAS 写入、未知表第一轮不删除。

## 13. Action items

| 动作 | Owner | 前置 | 交付 |
| --- | --- | --- | --- |
| 审阅并批准本规格 | 负责人 | 本文 | 规格批准记录 |
| 形成逐文件实现计划和 caller 清单 | 工程实施 | 规格批准 | implementation plan、LSP references |
| 建立默认数据库副本和 schema inventory fixture | 工程实施 | 本规格 | 可重复迁移 fixture、manifest |
| 实现 Domain clean cutover | 工程实施 | caller 清单 | 新 Domain、旧 API 删除 |
| 实现窄 port 与通用 ClientAdapter | 工程实施 | Domain cutover | OMP/Claude adapter contract |
| 实现 SQLite Store 和 schema history | 工程实施 | migration fixture | 单一 Store、CAS、projection 分离 |
| 执行真实 OMP/Claude smoke 与迁移验证 | 工程实施 | 代码完成 | verification evidence |
| 同步 `_bmad-output` architecture 文档 | 工程实施 | 负责人批准、实现边界稳定 | 当前权威文档与代码一致 |

## 14. 规格审阅门

负责人审阅时只需要确认以下四点：

1. 是否批准 Domain clean cutover，而不是增量保留旧 API。
2. 是否批准 `ActivationOperation` 与 `LaunchObservation` 的分离。
3. 是否批准默认 SQLite 数据完整保留、未知表第一轮只盘点不删除。
4. 是否批准单一 Store、schema history、migration manifest 和 CAS 写入作为不可省略的 persistence contract。

四点批准后，下一步才是逐文件实现计划；在此之前不修改生产代码和 BMad 权威文档。

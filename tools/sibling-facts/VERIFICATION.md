# 2026-08-14 真实自检记录

以下记录来自本 worktree 的真实命令输出，不是预期值或构造样本。工具运行期间只执行查询。

## 单元测试

命令：

```powershell
python -m unittest discover tools\sibling-facts\tests -v
```

真实结果片段：

```text
Ran 4 tests in 0.016s

OK
```

测试覆盖非终态过滤、当前／兄弟终端标记、`orphaned`、D9 缺字段、数据源不可用时的「未观察到」、worktree porcelain 解析、PR 作者与 `headRefName`，并断言子进程调用只包含既定查询命令。

## 人类可读输出

命令：

```powershell
python tools\sibling-facts\sibling_facts.py
```

2026-08-14T19:28:55Z 的真实结果片段：

```text
## 非终态 Dispatch

1. 谁：Task task_7dd52ec505e7 / Dispatch ctx_2eeb857690c3 / terminal term_ec9554ec-c76f-45ab-9c63-98745aef70c5（当前调用者）
   写哪儿：C:/Users/<user>/orca/workspaces/agent-control/a4-sibling-facts
2. 谁：Task task_f613d2dc85a1 / Dispatch ctx_040bbbf074e2 / terminal term_e88d7d26-1b4c-47c3-b9ed-2470971bd6e1（兄弟）
   写哪儿：C:/Users/<user>/orca/workspaces/agent-control/a6-deadline-wake
3. 谁：Task task_2fd22cb18e43 / Dispatch ctx_bd69fae0d752 / terminal term_7c7fea8d-e83f-4c82-aec3-cc840a06d4e7（兄弟）
   写哪儿：C:/Users/<user>/orca/workspaces/agent-control/a1-govtext-dedup

## 采集状态

全部配置的数据源均成功读取，且未报告截断。
```

同一输出还观察到 9 个活终端，其中 1 个 `orphaned=true`；D9 持有者为 `claude-opus5-successor`、session 为 `91e67910-4dbc-46e4-b8ff-0c79b9133e97`；两仓共 18 个登记 worktree；三仓开放 PR 为 0。

## JSON 输出

命令：

```powershell
python tools\sibling-facts\sibling_facts.py --json
```

2026-08-14T19:29:09Z 的 JSON 经 PowerShell 解析后的真实摘要：

```json
{
  "schema_version": 1,
  "active_dispatches": 3,
  "siblings": 2,
  "live_terminals": 9,
  "orphaned": 1,
  "worktrees": 18,
  "open_prs": 0,
  "unobserved_sources": 0,
  "first_sibling_where": "C:/Users/<user>/orca/workspaces/agent-control/a6-deadline-wake",
  "agent_plugins_open_prs": 0
}
```

## 是否看见「第二个 Session 写 agent-plugins」

**这次真实输出能看见两个兄弟 Dispatch，但不能看见其中任何一个正在写 `agent-plugins`。** 当时两个兄弟的 Orca worktree 分别是 `agent-control/a6-deadline-wake` 与 `agent-control/a1-govtext-dedup`，三仓开放 PR 查询也返回 0；因此工具没有把历史事故或已经不开放的 PR 推断成当前事实。

这正是输出边界：本次可以证明「当前还有兄弟 Session」，但不能证明「当前有兄弟 Session 正在写 agent-plugins」。如果以后 `worker-list`／`terminal list` 的 worktree 或三仓开放 PR 的 `headRefName` 直接出现 `agent-plugins`，工具才会报告该事实；否则保持「未观察到」。

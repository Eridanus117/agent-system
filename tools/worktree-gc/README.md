# Orca worktree 清理例程

本工具为关联 [#243（worktree 清理例程与本批清理）](https://github.com/Eridanus117/agent-control/issues/243)提供保守的人工收口步骤。它只枚举同一 Git 仓已登记、且解析后位于指定 Orca workspace 根下的 worktree；默认仅输出 dry-run，不建设定时器、Hook 或常驻清理器。

## 安全合同

每个 worktree 必须同时满足以下条件才进入通过集：

- 当前提交已合入 `origin/main`，或本地分支有明确的 `origin` upstream 且 `git fetch --prune origin` 后该 upstream 已消失；
- `git status --porcelain=v1 --untracked-files=all` 为空；
- Orca 当前终端列表中没有绑定该精确路径；
- 所有普通 Run 的 `dispatched` Task 经 `worker-show` 解析后，没有绑定该精确路径；
- 不是运行本工具的当前 worktree。

活动面、Git 状态、祖先关系或 upstream 状态任一不可读时，工具保留对象。删除使用无 `--force` 的 `git worktree remove`；本地分支已合入 main 时使用 `git branch -d`，只有“原 upstream 已明确消失”这一路径允许用 `git branch -D` 清理已无远端来源的本地分支。

## 波次收口步骤

先按当前 Orca 二进制的指南核对 CLI，再运行 dry-run：

```text
orca skills get orchestration --full
orca skills get orca-cli
python tools/worktree-gc/worktree_gc.py --workspace-root C:/Users/<user>/orca/workspaces/agent-control
```

把完整 dry-run 报告发布到对应合同 Issue，人工确认通过集后才显式执行：

```text
python tools/worktree-gc/worktree_gc.py --workspace-root C:/Users/<user>/orca/workspaces/agent-control --execute
```

执行模式会先重新生成一次计划，并在每个删除动作前再次读取全部活动终端与 Dispatch；新出现的绑定会让该对象转为保留。最后把 dry-run 的通过集、实际移除集、清理前后数量、保留原因和动作失败逐项写回合同 Issue。

机器需要 Python 3.10+、Git、已登录且正在运行的 Orca。`--orca-command` 可覆盖指南规定的可执行命令；`ORCA_CLI_COMMAND` 与 `ORCA_DEV_REPO_ROOT` 的选择规则和现行 Orca 指南一致。

## 验证

```text
python -m unittest discover -s tools/worktree-gc/tests -v
python -m py_compile tools/worktree-gc/worktree_gc.py
```

当前交付只证明工具测试与本批真实执行；不证明无人值守清理、长期低误删率或 Orca 长期依赖。

# private-local 挂载维护者说明

本说明面向需要在本机 worktree 使用私有 Agent 资产的维护者。机制只投影到 checkout 内的 `.omp/local/`，不把私有 profile、真实本机路径或跨仓实时软链提交到 Git。

## 版本消费

当前可复核的机制版本：

- package：`@agent-system/mounts`
- package version：`0.1.0-private-mount-acceptance-SNAPSHOT`
- 验收基线 commit：`6935f4c`（`0.1.0-private-mount-acceptance-SNAPSHOT`）
- 消费方式：固定到明确 commit SHA；不要消费 `main`、工作目录未提交内容或跨仓实时软链。

该 package 当前为仓内 private package，未声明远端制品发布。目标仓需要将 agent-system 作为已审阅的固定版本来源，再由目标仓自己的薄 adapter 调用 CLI 或公开 TypeScript API。

## 文件边界

将两个 profile 文件放在目标仓 Git common dir 的本机层或其他不会被目标仓跟踪的目录：

- `manifest.json`：只保存版本、`private-local` profile、root ID 和安全相对路径。
- `roots.json`：保存 root ID 到本机绝对路径的映射，以及 `private-local` trust domain。

不要把 `roots.json`、真实私有资产、真实业务路径或私有 profile 加入 Git。manifest 的 `source` 和 `target` 只能使用安全相对路径；target 必须位于当前 checkout 内。

## 生命周期命令

以下命令使用固定版本 checkout 中的 CLI。`$AGENT_SYSTEM` 应指向已固定到上述 SHA 的 agent-system checkout；`$PROFILE` 和 `$CHECKOUT` 是本机路径。

```text
bun "$AGENT_SYSTEM/packages/mounts/src/cli.ts" init \
  --manifest "$PROFILE/manifest.json" \
  --roots "$PROFILE/roots.json"

bun "$AGENT_SYSTEM/packages/mounts/src/cli.ts" plan \
  --manifest "$PROFILE/manifest.json" \
  --roots "$PROFILE/roots.json" \
  --checkout "$CHECKOUT"

bun "$AGENT_SYSTEM/packages/mounts/src/cli.ts" sync \
  --manifest "$PROFILE/manifest.json" \
  --roots "$PROFILE/roots.json" \
  --checkout "$CHECKOUT"

bun "$AGENT_SYSTEM/packages/mounts/src/cli.ts" doctor \
  --manifest "$PROFILE/manifest.json" \
  --roots "$PROFILE/roots.json" \
  --checkout "$CHECKOUT"

bun "$AGENT_SYSTEM/packages/mounts/src/cli.ts" repair \
  --manifest "$PROFILE/manifest.json" \
  --roots "$PROFILE/roots.json" \
  --checkout "$CHECKOUT"
```

- `init` 只创建缺失的 profile 文件，不创建 checkout 入口。
- `plan` 只评估，不写入。
- `sync` 只创建验证通过且缺失的软链；失败时输出 `private overlay unavailable` 或 blocked 结果，不创建部分挂载。
- `doctor` 只读报告 source、target、profile 和 trust-domain 问题。
- `repair` 是显式修复入口；它可以移除错误软链，但不会覆盖普通文件或未知对象。
- hook 若需要同步，只调用非交互式 `sync`，不能调用 `repair`。

## 失败处理

`blocked` 或 `private overlay unavailable` 不是成功状态。先处理报告的 root、路径、source、target、trust-domain 或冲突问题，再重试 `plan`。Git checkout 本身不依赖挂载成功，挂载失败不得阻断分支切换。

已有正确软链会被保留；已有普通文件、错误软链和未知对象不会被 `sync` 自动覆盖或删除。若确实要修复错误软链，必须显式执行 `repair` 并先确认目标路径。

## 公共面门禁

公共仓的 staged/index tree 由以下入口检查：

```text
bun "$AGENT_SYSTEM/tools/public-tree-gate/index.ts"
```

门禁要求显式 allowlist；配置缺失、配置无效、index/blob 读取失败、归档无法完整展开或评估异常都必须保持失败。它扫描最终 Git index，不扫描被忽略或未跟踪的工作目录内容。公共仓不得把真实私人 profile 或业务资料作为 fixture。

## 验收证据

当前版本的可重放证据位于：

- `packages/mounts/tests/`：合同、MountPlan、PublicTreeAssessment、生命周期测试。
- `packages/mounts/tests/acceptance.test.ts`：`/tmp` 合成 root、真实临时 Git repository 和 detached worktree 的端到端验收。
- `tools/public-tree-gate/tests/public-tree-gate.test.ts`：合规 tree、symlink、忽略文件、未跟踪内容、敏感内容、归档和 blob 读取失败。
- 固定消费 smoke：验收测试把 agent-system clone 到临时目录并 checkout `6935f4c5e3e31b101095ed00472a100633f4ec8f`，再从该 SHA 执行 CLI；固定版本 HEAD 校验通过。
- `/tmp` 真实 worktree smoke：`acceptance.test.ts` 覆盖 `init`、`plan`、合成 hook 调用的 blocked `sync`、成功 `sync`、`doctor`、错误软链 `repair`；`1 pass / 20 expect calls`。hook wrapper 只调用非交互式 `sync`；blocked 期间执行真实 `git checkout --detach HEAD`，checkout 与 `git status --porcelain` 均成功且无部分链接。
- package 验证：mounts typecheck 通过；mounts 全量测试 `34 pass / 0 fail`；公共门禁合成测试 `6 pass / 0 fail`；公共门禁入口 TypeScript 检查通过。
- prototype 验证：运行 `worktrees/agent-system/private-mount-prototype/prototypes/private-mount-manifest.html`，正常场景显示“计划可以执行”，本机根缺失场景显示“整个计划被拒绝”且写入列表为空；该页面只使用合成数据。
- 公共门禁负向证据：对当前整合树执行实际 index 扫描返回 `124` 项既有违规并退出 `1`；门禁没有通过放宽 allowlist 伪造成功，既有内容清理另行处理。

合成测试通过只证明受控 fixture 行为；真实私有 profile、业务仓内容和生产部署不属于本仓验收范围。

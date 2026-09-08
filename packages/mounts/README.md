# @agent-system/mounts

通用的本机私有挂载机制与 GitHub 公共面门禁。父事项 [Issue #56](https://github.com/Eridanus117/agent-system/issues/56)。

本包不读取任何具体私人仓的内容：manifest 只引用 root 别名与相对路径，真实绝对路径只存在于目标仓 Git common dir 里的 machine-local roots 文件；测试只用合成路径与合成内容。

## 两个 seam

| seam | 入口 | 输入 | 输出 |
|---|---|---|---|
| MountPlan | `evaluateMountPlan()` | 原始 manifest、原始 roots、checkout 绝对路径、`PathProbe` | `ready`（writes / keeps / skips）或 `blocked`（errors 非空、writes 必空） |
| PublicTreeAssessment | `assessPublicTree()` | 最终 staged/index tree 的条目迭代器、策略原文 | `allowed` 或 `blocked`（violations 带路径、稳定代码、规则名） |

两者都是纯函数：MountPlan 通过 `PathProbe` 读路径状态，不写文件系统；PublicTreeAssessment 通过 `TreeEntry.read()` 按需读内容，不接触工作目录。

## manifest（目标仓侧，V1）

```json
{
  "version": 1,
  "profile": "private-local",
  "mounts": [
    { "id": "nav", "root": "private", "source": "nav", "target": ".omp/local/nav", "type": "dir", "required": true, "readonly": true }
  ]
}
```

- `profile` 只授权 `private-local`；未知字段、未知版本一律拒绝。
- `source` 是 root 下的安全相对路径，`target` 是 checkout 内的安全相对路径且必须位于 `.omp/local` 之下；绝对路径、`.`、`..`、反斜杠、空段都拒绝。
- `required: false` 时 source 缺失只记为 skip；`readonly` 记录并透传，符号链接本身不强制只读。

## machine-local roots（本机层，不入库）

```json
{ "version": 1, "roots": { "private": { "path": "/absolute/machine/path", "trust": "private-local" } } }
```

`trust` 认识 `private-local` / `shared-runtime` / `public` 三个值，但 V1 只授权第一个：其它两个在计划阶段以 `unauthorized-root` 阻断，未知字符串在解析阶段以 `unknown-trust-domain` 阻断。

## MountPlan 的阻断条件

manifest 与 roots 的 schema 错误、`checkout-missing`、`unknown-root`、`unauthorized-root`、`root-missing`、`source-missing`、`source-escapes-root`、`source-type-mismatch`、`target-parent-not-directory`、`target-escapes-checkout`、`target-occupied`、`target-wrong-symlink`、`target-unknown-object`、`duplicate-target`、`target-overlap`。任一条命中，整体 `blocked` 且 `writes` 为空；已正确存在的入口仍在 `keeps` 里报告，便于审计。完整清单见 `src/contract.ts` 的 `MountErrorCode`，每个值在 `tests/mount-plan.test.ts` 都有对应的失败测试。

## PublicTreeAssessment 的策略

```json
{
  "version": 1,
  "allowedPaths": ["docs/", "README.md"],
  "deniedPaths": ["*.log", "**/node_modules/"],
  "contentExemptPaths": ["tests/fixtures/negative/"],
  "deniedTokenHashes": ["<sha256(小写词)>"],
  "maxFileBytes": 1000000,
  "largeFileAllowlist": [],
  "archiveMaxDepth": 2
}
```

- allowlist 优先、denylist 补充；策略缺字段、多字段或 allowlist 为空即 `policy-invalid`，整体 blocked。
- symlink、gitlink、仓外路径无条件拒绝。
- 内容规则：凭据形状、本机家目录路径、内网地址与内部主机名、按哈希登记的业务标识。`contentExemptPaths` 只豁免内容规则，路径、大小与归档规则照常。
- 大文件不在 `largeFileAllowlist` 里就拒绝，但内容照样完整扫描；zip / gzip / tar 按魔数识别（改扩展名无效），成员递归扫描，超过 `archiveMaxDepth`、加密、zip64 或解不开的都拒绝。

## CLI（目标仓侧薄执行层）

```
bun packages/mounts/src/cli.ts <command> [--checkout <dir>] [--manifest <file>] [--roots <file>] [--json]
```

| 命令 | 作用 | 退出码 |
|---|---|---|
| `init` | 在目标仓 git common dir 下建 `mounts/manifest.json`、`mounts/roots.json` 骨架（已存在不覆盖），并把 `/.omp/local/` 写进 `info/exclude` | 0 |
| `plan` | 评估计划，不写任何东西 | 0 ready / 2 blocked |
| `sync [--hook]` | 只创建计划里已验证且缺失的链接；写入前还要求每个 target 已被 git 排除（`target-not-excluded`）；任一链接创建失败即回滚本轮全部写入（`write-failed`）。`--hook` 模式失败也退出 0，stderr 打印 `private overlay unavailable`，不阻断 checkout | 0 / 2（hook 恒 0） |
| `doctor` | plan 加 exclude 检查，报告 source / target / exclude / trust 问题与只读条目 | 0 / 2 |
| `repair` | 只移除 `target-wrong-symlink` 的错误链接再 sync；普通文件、目录与未知对象永远不动 | 0 / 2 |
| `assess-public-tree --policy <file> [--rev HEAD] [--repo <dir>]` | 读 git tree（`ls-tree` + `cat-file --batch`，不读工作目录）跑公共面评估 | 0 allowed / 2 blocked |

用法或环境错误（不是 git checkout、manifest 缺失、策略文件缺失）退出 1。

manifest 与 roots 默认放在 `$(git rev-parse --git-common-dir)/mounts/`：同一仓的所有 worktree 共享，且不进任何远端。

### post-checkout hook（可选）

hook 只做非交互式 sync，失败不阻断 checkout。在目标仓 `.git/hooks/post-checkout` 里调用固定版本的 agent-system：

```
bun /path/to/agent-system@<pinned-sha>/packages/mounts/src/cli.ts sync --hook --checkout "$PWD"
```

版本消费：目标仓记录所依赖的 agent-system commit SHA（或 `mounts` 包版本），不用指向 agent-system 工作树的实时软链；升级 agent-system 不会隐式改变目标仓行为。

## GitHub 公共面门禁

`.github/workflows/public-gate.yml` 在 PR 与 main 上先跑 `scripts/public-gate-smoke.ts`（合成违规 tree 必须 blocked、合规必须 allowed、缺策略必须失败），再对 HEAD 的最终 tree 跑 `assess-public-tree --policy .github/public-tree-policy.json`。策略里的 `contentExemptPaths` 是既有违规的显式豁免清单，收缩它就是收紧门禁；决定与理由见 `docs/adr/0002-公共面门禁扫最终tree并显式豁免.md`，验收证据见 `docs/2026-09-08-验收记录.md`。

## 开发

```
bun install            # 仓库根
bun run typecheck      # packages/mounts
bun run test
```

CI 由 `.github/workflows/packages-checks.yml` 的包 × 平台矩阵覆盖。

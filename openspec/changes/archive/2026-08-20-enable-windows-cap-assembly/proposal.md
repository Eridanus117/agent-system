## Why

`authority/08-mvp-implementation-direction.md` 把 Windows 定为稳定入口，但 `cap` 装配路径当前只能在 POSIX 宿主运行：负责人在 `C:\Workspace\agent-system` 执行 `uv run cap`，得到 `profile: error: render output requires POSIX component-safe directory handles`，Windows 上无法使用任何 profile，包括 `agent-assembler`。三条 CI job 全部只跑 `ubuntu-latest`，仓内没有任何平台分支，这条路径从未在负责人的实际宿主上被验证过。

`cap` 的目标宿主是 Windows 与 macOS 两端。因此本变更的做法不是"给 Windows 再写一套实现"，而是把装配路径上少数几处只能在 POSIX 表达的机制，换成两端共用的一份实现。

## 与已落地上游工作的关系

本 change 规划期间，两件事已由上游独立落地，本 change **不再承载**它们：

- **资产权限位**（原计划的第一个提交）由 [#84](https://github.com/Eridanus117/agent-system/pull/84) 的 `_canonical_mode` 落地。上游实现直接返回常量，并记录了本 change 遗漏的一项事实：**WSL 经 DrvFs 访问时对每个文件报 `0o777`**。原 design D1 打算在 POSIX 侧校验实际权限位并拒绝可执行资产——那条规则会让任何经 `/mnt/c` 运行的会话把全部锁定输入判为可执行而拒绝。上游的"权限位不携带可移植信息、直接返回常量"更正确，本 change 采纳它，不再提出替代方案。
- **`omp/runtime.py` 的 `_validate_private_runtime`** 由 [#85](https://github.com/Eridanus117/agent-system/pull/85) 落地，且在 Windows 分支补了本 change 没有的替代约束（限制在 CAP 托管根内 + 逐分量拒绝重解析点），并显式记录了"不读 ACL"这一残余弱点。本 change 采纳它。

因此本 change 现在只承载一件事：**把 POSIX-only 的目录句柄链换成两端共用的分量校验**，以及由此派生的写入策略与认证结论表达。

## What Changes

- **锁定输入与渲染树采用平台中立的资产权限位。** 现在 `_input_records` 与 `_render_tree` 直接把 `stat.S_IMODE(...)` 记入 lock 与 render tree；Windows 上 Python 一律报告 `0666`，与仓库锁内的 `0644` 不符，于是 `capability lock drift detected` 在第一步阻断全部子命令。改为把仓内资产权限位钉为规范值，并在能表达该语义的 POSIX 宿主上校验实际权限位（拒绝可执行位与 group／other 写位）。
- **目录安全校验改为两端共用的一份实现，不再锚定目录句柄。** 现在 `_open_stable_directory` 依赖 `os.open(dir_fd=...)`、`O_DIRECTORY`、`O_NOFOLLOW`，Windows Python 三者皆无。改为逐分量用 `os.lstat` 拒绝符号链接与重解析点、绑定 `st_dev`／`st_ino` 对象身份、在操作前后复核身份——这三件事在 Windows 与 macOS 上都由标准库原生支持，同一份代码即可，无需 `ctypes`，无需平台分派。描述符语义被 18 个函数直接消费，因此改写面是 6 个簇而不只是入口实现。
- **宿主无法表达的安全结论显式报告为 `unknown`，不伪装通过、也不阻断启动。** 认证目录的属主与"仅当前用户可访问"两项判定在 Windows 上没有可移植表达；POSIX 侧保持现有检查不变，Windows 侧把该结论报为 `unknown`。硬链接数检查（`st_nlink`）两端原生可用，保持为门。
- **新增跨宿主 CI job**：一个 `windows-latest` job 与一个 `ubuntu-latest` job 跑同一条 lock 复现检查，使"同一提交在两端产出相同 digest"由两侧门禁共同证明，而不是靠单机手工核对；现有三个 `ubuntu-latest` job 不变。
- 不含 **BREAKING**：资产权限位改动在当前仓库内容下产出与已提交 `.cap/lock.json` 逐位相同的结果（见基线证据）；POSIX 侧的检查集合不减少。

## Capabilities

### New Capabilities
- `portable-assembly-host`：装配路径在受支持宿主上的可运行范围、平台中立的资产权限位语义、两端共用的目录安全校验保证、中止写入不得在目标位置留下可被误认为成品的残留，以及宿主无法表达某项安全结论时必须显式报 `unknown` 而非伪装通过的规则。

### Modified Capabilities
（无。现有 spec 未对锁定输入的权限位或宿主平台作出需求级约定。）

## Impact

- **受影响实现：** 主体位于 `src/agent_system/profile/cli.py`，另含 `src/agent_system/omp/runtime.py` 的 `_validate_private_runtime`（实测发现的第 7 簇，同样依赖 `os.geteuid()`）。`src/agent_system/cap/cli.py` 不改变命令面。
  - 资产权限位：`_input_records`（两个分支）、`_render_tree`（skill 源与 hook／plugin target）、`_materialize_evidence` 的落盘 mode。
  - 写入策略：渲染与物化改为先写私有暂存目录再一次性移入目标（见 `design.md` 的 D7）。
  - 目录安全校验：`_normalize_root_alias` 与 6 簇共 18 个直接消费 `StableDirectory.descriptor` 的函数——A 句柄链核心、B 目录内容与空目录判定、C 认证私有性、D 认证暂存、E 渲染物化、F 回执预留与提交。逐簇清单见 `design.md` 的 D2。
- **受影响 profile：** `general` 与 `agent-assembler` 同等受益；不新增、不删除任何 profile，不改变任一 profile 的能力闭包。
- **受影响声明与证据：** `.cap/lock.json` 的 `inputs[].mode` 与 `profiles[].clients[].tree_hash` 语义来源；本仓当前内容下取值不变。
- **依赖：** 只使用 Python 标准库，不引入新的第三方运行时依赖，不引入 `ctypes` 平台分支，不引入 PowerShell／Batch 产品脚本（README《持久实现语言》）。
- **CI：** `.github/workflows/` 增加一个新 workflow 文件，内含 `windows-latest` 与 `ubuntu-latest` 两个 job；现有三个 job 不动。

## 非目标

- **不处理 codex 与 qoder 在 Windows 上的认证暂存。** 这两个客户端用 `os.symlink` 把凭据链接进一次性运行时根，而 Windows 创建符号链接需要 `SeCreateSymbolicLinkPrivilege` 或开发者模式。omp 不走这条路（见基线证据），因此本变更只交付 omp 在 Windows 上可用；codex／qoder 的 Windows 暂存方式是一个独立的安全取舍，留作后续变更。
- 不改变任一 profile 的能力闭包、prompt 或 Skill 正文。
- 不改变 `cap` 的命令面、参数名或输出结构。
- 不接管认证、token、provider 账号或用户目录能力继承（`docs/cap-guide.zh-CN.md` §1 边界不变）。
- 不为 Windows 放宽 POSIX 侧任何既有检查。
- 不处理 WSL 路径（已评估并否决，理由见 `design.md`）。

## 回滚边界

- 资产权限位与目录校验为两个独立提交，可单独 revert；两者都不写入 `.cap/lock.json` 内容变更，因此 revert 不需要重新 `lock`。
- 本机状态（`$HOME/.agent-system-state/` 下的 machine-context、pin 与 binding）不由本变更迁移；binding 失配时按既有 `cap assembly-bind` 流程重建。
- 任一提交回滚后 POSIX 宿主行为与当前 `main` 一致。

## 基线证据

均于 2026-08-19 在 Windows 11 Pro 10.0.26200 + CPython 3.14.2 实测，工作树 `Eridanus117/win-omp` 与 `origin/main`（`1a637f9`）同点且干净：

- `uv run cap agents` → `profile: error: capability lock drift detected`。
- 计算 `_input_records` 与 `.cap/lock.json` 的 `inputs` 差异：44 条中 24 条不符，**唯一差异是 `mode` 为 `0666` 而锁内为 `0644`；24 条的 `sha256` 全部一致**，目录条目全部一致。
- 仅归一化权限位后，`_desired_lock` 与已提交 `.cap/lock.json` 逐位相同（`agent-assembler` 的 omp `tree_hash` = `sha256:00533f2e2550229ca525576afeb091d2ebbf5274b69660bc8ee31fb9b7173974`，与锁内一致），`cap agents`／`cap assembly-bind`／`cap verify` 全部通过，`cap verify` 返回 `{"status": "ok"}`。
- 同一条件下 `cap show agent-assembler --cli omp` 仍失败于 `render output requires POSIX component-safe directory handles`，确认目录校验为独立且必要的阻塞点。
- 本机 CPython 缺失的接口：`os.supports_dir_fd == set()`，`O_DIRECTORY`、`O_NOFOLLOW`、`os.geteuid` 均不存在。
- 本机 CPython **原生可用**的接口：`os.lstat` 不跟随 junction，且 `st_file_attributes` 可判出重解析点（实测 junction 得 `attrs=0x410`、`st_reparse_tag=0xa0000003`，真实目录得 `attrs=0x10`）；`st_dev` 与 `st_ino` 均有值且能区分对象；`st_nlink` 正确反映硬链接数（建立硬链接后两个名字均报 `nlink=2`）。
- `_staged_auth`（`cli.py:1304-1364`）三个客户端路径不同：codex 与 qoder 用 `_create_auth_symlink` 暂存凭据文件／目录，**omp 只读取 `broker.json` 与 `token` 的值并经 `OMP_AUTH_BROKER_URL`／`OMP_AUTH_BROKER_TOKEN` 传入，不在磁盘上产生任何凭据副本**。
- `git ls-files -s` 显示仓内仅 `tools/public_surface_check/public_surface_check.py` 为 `100755`，`.cap`、`plugins`、`.agents` 下 138 个文件全部为 `100644`；即锁定输入与渲染源中不存在可执行资产。
- `omp` 客户端已安装于 `C:\Users\<user>\.bun\bin\omp.exe`。

## 官方一手来源

- CPython `os` 模块文档（`os.supports_dir_fd`、`os.lstat` 对重解析点的处理、`os.stat_result` 的 `st_file_attributes`／`st_reparse_tag`／`st_ino`／`st_dev`／`st_nlink` 在 Windows 上的语义、`st_uid`／`st_mode` 在 Windows 上不承载 POSIX 权限语义）：<https://docs.python.org/3/library/os.html>
- CPython `stat` 模块文档（`FILE_ATTRIBUTE_*` 常量与 `IO_REPARSE_TAG_*` 标签）：<https://docs.python.org/3/library/stat.html>
- Microsoft Learn 重解析点与符号链接创建权限（`SeCreateSymbolicLinkPrivilege` 与开发者模式，控制"不处理 codex／qoder Windows 暂存"这一非目标）：<https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points>

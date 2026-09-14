# Orca 注入 `CODEX_HOME` 下的 Codex 权威入口桥接：研究记录

## 范围

- 任务：为 `agent-control#49` 的外部插件侧影子对照，调查真实问题“Orca 注入专用 `CODEX_HOME` 时，Codex 如何取得当前权威入口”。
- 环境：Windows；仓库根目录 `C:\Users\<user>\workspace\agent-control`；核验日期 2026-08-11。
- 当前会话：`CODEX_HOME=C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home`，`USERPROFILE=C:\Users\<user>`。
- 边界：只读 GitHub Issue、官方文档、仓库和本机配置；没有修改 GitHub、配置或受跟踪文件，也没有启动会写入运行状态的新 Codex 会话。
- 本阶段只记录事实、约束、冲突和未知，不提出或选择方案。

## 已读取的仓库指导与合同

- `README.md` 与 `authority/00-map.md`：版本化入口是 `entrypoints/agent-system.md`；实际入口副本不是新权威；普通 Windows 与宿主专用 `CODEX_HOME` 两条路径都应覆盖。
- GitHub Issue `agent-control#49`（2026-08-11 只读恢复）：状态 `OPEN`；要求用真实材料做外部插件与自有能力影子对照；不得切换路由、禁用能力或修改配置。
- `authority/08-mvp-implementation-direction.md`：记录第二条路径只读追踪发现 Orca 把默认 `.codex\AGENTS.md` 同步为专用 `CODEX_HOME` 中的受管副本，并曾授权受限最终验证；后续段落也把普通 Codex、Orca Codex 和 Claude 的真实入口列为同步对象。
- `knowledge/project-instructions.md`：2026-08-11 核验的当前知识；其 Codex 结论与本次重新打开的官方页面一致，未命中失效条件。

## 官方行为事实

OpenAI 官方文档 [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) 说明：

1. Codex 每次运行开始时建立一次指令链。
2. 全局层从 Codex home 读取 `AGENTS.override.md`，不存在时读取 `AGENTS.md`，且只使用第一个非空文件。
3. Codex home 默认是 `~/.codex`；设置 `CODEX_HOME` 后改用该变量指向的目录。
4. 项目层随后从项目根到当前目录逐层读取，离当前目录更近的指导后置。

官方 [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic) 同时说明用户配置通常位于 `~/.codex/config.toml`；本任务没有把配置文件位置等同于指令入口位置，而是单独核验了 `AGENTS.md` 发现规则。

## 本机真实文件与数据流

### 两个 Codex home

| 启动环境 | Codex home | 全局入口 |
| --- | --- | --- |
| 未设置 `CODEX_HOME` 的普通 Windows | `C:\Users\<user>\.codex` | `C:\Users\<user>\.codex\AGENTS.md` |
| 当前 Orca 宿主 | `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home` | `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home\AGENTS.md` |

当前 Orca home 中没有 `AGENTS.override.md`，因此按照官方发现顺序，其 `AGENTS.md` 是该启动路径的全局入口候选。

### 当前内容一致性

将 CRLF 规范化为 LF 后，下列四份文件的 UTF-8 长度均为 10,314 字节，SHA-256 均为 `D0444CAA4B85C0319A0A394C9BE9852489011D865A36D1A0A0A6C33EED07DDF4`：

- `C:\Users\<user>\workspace\agent-control\entrypoints\agent-system.md`
- `C:\Users\<user>\.codex\AGENTS.md`
- `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home\AGENTS.md`
- `C:\Users\<user>\workspace\agent-control\build\entry-sync\installed\orca-codex\AGENTS.md`（既有未跟踪生成物，只读观察）

仓库源文件与两份实际入口的物理字节数不同只来自换行形式；`git diff --no-index` 没有正文差异。普通入口与 Orca 入口的文件时间也相同，均为 2026-08-11 10:57:30（本机时间）。

### Orca 资源形态

- Orca home 中的 `plugins` 和 `skills` 是分别指向 `C:\Users\<user>\.codex\plugins` 与 `C:\Users\<user>\.codex\skills` 的目录 junction。
- Orca home 中的 `AGENTS.md` 是普通文件，不是符号链接、junction 或 reparse point。
- `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home\.orca-resource-copies\AGENTS.md.json` 内容为 `sourcePath: C:\Users\<user>\.codex\AGENTS.md`。该标记把 Orca 副本直接关联到普通 Codex 入口，但标记自身没有记录刷新频率、失败策略或版本号。

据此，本次样本能观察到的数据流是：

```text
entrypoints/agent-system.md（仓库版本化来源）
          │
          ├── 内容相同 ──> C:\Users\<user>\.codex\AGENTS.md
          │                         │
          │                         └── Orca 资源复制来源标记
          │                                  │
          └── 内容相同 ───────────────> Orca CODEX_HOME\AGENTS.md
```

这里“内容相同”和“来源标记存在”是已核验事实；谁在何时执行每一次复制、是否具有持续刷新保证，仍是未知。

## 仓库现有同步与验证面

提交 `206c371`（2026-08-11，`S3：入口单一真源生成器（D5）`）加入 `scripts/entry_sync/`：

- `targets.json` 把 `entrypoints/agent-system.md` 声明为唯一 source。
- `installed-codex` 目标指向用户 home 下的 `.codex/AGENTS.md`。
- `installed-orca-codex` 目标固定指向 `%APPDATA%\orca\codex-runtime-home\home\AGENTS.md`。
- `generate` 把生成内容写入仓库 `build/entry-sync` staging；即使带 `--write-repository` 也只更新仓内目标，从不写用户目录或 `%APPDATA%`。
- `check` 读取实际 installed 目标，与 source 做换行规范化比较；它能发现缺失或内容漂移，但不是安装器。
- 路径解析拒绝越出声明根目录；单元测试覆盖 copy 目标不读取/写入 installed 目的地、目标 ID 重复、路径越界和规范化差异等行为。

本次以 `PYTHONDONTWRITEBYTECODE=1` 和 `python -B` 运行只读命令：

```text
python -B -m scripts.entry_sync check --scope installed
```

结果为退出码 0，`installed-claude`、`installed-codex`、`installed-orca-codex` 三项均为 `[OK]`。命令后 `git status --short` 仍只有任务开始前已存在的 `?? build/`。

## 当前权威中的表述冲突

- `authority/00-map.md` 的“后续确认”仍写：普通 Windows 已验证；宿主注入专用 `CODEX_HOME` 的环境“是否以及如何桥接仍需按成本和风险选择方案”。
- 同属当前权威的 `authority/08-mvp-implementation-direction.md` 已记录 Orca 受管副本的只读来源追踪、受限最终验证授权，以及后续把 Orca Codex 真实入口作为同步对象的实施结果。
- 当前仓库的声明式目标、当前 Orca 资源标记和实时哈希又共同显示：本机当前样本事实上已经存在一条“普通入口副本 → Orca 受管副本”的桥。

因此，“当前样本是否有桥”与“权威是否已经选定长期桥接方案”不能被视为同一个问题：前者已有肯定证据，后者的根权威表述尚未收敛。

## 约束

- `entrypoints/agent-system.md` 是唯一版本化来源；实际副本不能反向成为权威。
- 当前任务无权修改 Orca 启动链、运行目录、用户配置、Hooks、Plugins、GitHub 或受跟踪文件。
- 持久程序只能使用 Go、Python、TypeScript 或 Rust；本仓已有 Python 同步/校验实现。
- 无条件入口正文受 LF 规范化 10,241 字节的既定上限约束；本次实测为 10,314 字节，与该权威数字也存在 73 字节差异，不能在本任务中静默改写任一方。
- 官方说明指令链通常每次启动构建一次；入口变化不能假定会被已经启动的会话即时重载。

## 未知与不能推出的结论

1. `.orca-resource-copies/AGENTS.md.json` 没有说明 Orca 在什么事件刷新副本、刷新是否原子、源缺失时怎样处理、失败是否可见。
2. 仓库 `entry_sync` 只生成 staging 并校验 installed 目标；没有提供把生成物安装到普通或 Orca home 的命令，也没有说明由哪个外部动作负责安装。
3. `installed-orca-codex` 使用固定 `%APPDATA%\orca\codex-runtime-home\home`，没有直接解析运行时 `CODEX_HOME`。当前环境恰好匹配该路径，不能推出未来其他 Orca profile、版本或便携目录也会匹配。
4. 当前哈希一致只支持“2026-08-11 这个实时样本未漂移”；不能单独证明自动刷新长期可靠，也不能证明所有新 Orca 会话都已加载并遵循正文。
5. 本任务没有启动新的 Codex 进程，因为那会在唯一允许的 `codex-work` 范围外写入会话/运行状态；因此没有新增端到端加载证据。
6. 没有读取 Orca 产品源码或正式资源复制合同；当前只把宿主目录内可重复观察的标记与文件状态当作环境证据。

## 验证面与证据等级

- 可重复静态检查：读取 `CODEX_HOME`，确认无 `AGENTS.override.md`，比较三份入口的 LF 规范化哈希，读取资源复制来源标记，运行 `python -B -m scripts.entry_sync check --scope installed`。
- 需要额外授权的动态检查：在受控的 Orca 新会话中确认加载来源、模拟 source 更新后的刷新、观察失败与恢复路径。
- 本阶段证据最高支持“当前实现/当前交付样本一致”；不支持“长期自动同步可靠”“产品采用”或“长期依赖”。

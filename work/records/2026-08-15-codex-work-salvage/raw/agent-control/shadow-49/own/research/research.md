# 研究：Orca 注入 CODEX_HOME 环境下的 Codex 权威入口桥接（只含事实、约束、未知）

> 产物属性：agent-control#49 影子对照·自有侧 B 的研究段。全部证据于 2026-08-11 只读采集；本文件不提方案。

## 事实（每项附来源）

### 问题定义来源

- F1. 当前权威记录：「Windows Codex 的当前权威入口需要同时覆盖两种启动路径：未设置 `CODEX_HOME` 的普通 Windows 环境，以及由当前宿主注入专用 `CODEX_HOME` 的环境。前者已经验证通过；后者是否以及如何桥接仍需按成本和风险选择方案。」（来源：`authority/00-map.md`「后续确认」段）

### 两个 Codex Home 的实体

- F2. 普通路径 Home 为 `C:\Users\<user>\.codex\`，含 `AGENTS.md`（10314 字节，LF 行尾）、独立 `config.toml`（14433 字节）、`hooks.json`（当前为空 `{"hooks":{}}`）。（来源：目录列表与文件读取）
- F3. Orca 注入的 `CODEX_HOME` 为 `C:\Users\<user>\AppData\Roaming\Orca\codex-runtime-home\home\`，含自己的 `AGENTS.md`、独立 `config.toml`（16408 字节）、独立 `hooks.json`（把 SessionStart／UserPromptSubmit／PreToolUse 等事件全部接到 `C:\Users\<user>\.orca\agent-hooks\codex-hook.cmd`）。（来源：该目录列表、`hooks.json` 读取）
- F4. Orca Home 的 `plugins` 与 `skills` 是指向 `C:\Users\<user>\.codex\plugins`、`C:\Users\<user>\.codex\skills` 的 NTFS Junction（Reparse Tag 0xa0000003，Mount Point），即插件与技能两侧共享同一份安装内容。（来源：`dir` Junction 列表与 `fsutil reparsepoint query`）

### 入口正文的当前同步状态

- F5. 两份安装侧 `AGENTS.md`（`.codex\AGENTS.md` 与 Orca Home `AGENTS.md`）SHA-256 全等：`d0444caa4b85c031…`，且 mtime 同为 2026-08-11 10:57——当前入口正文事实上已经一致。（来源：`sha256sum` 与目录列表）
- F6. 仓库版本化来源 `entrypoints/agent-system.md`（工作区 checkout 为 CRLF、10395 字节）按 LF 规范化后哈希与两份安装副本完全相同——三份正文内容一致，仅行尾表示不同。（来源：`tr -d '\r' | sha256sum` 对照）
- F7. D5 入口单一真源生成器（PR #47 交付的 `scripts/entry_sync/`）的 `targets.json` 已显式包含目标 `installed-orca-codex`：`base=environment, variable=APPDATA, path=orca/codex-runtime-home/home/AGENTS.md`，与 `installed-codex`（`home/.codex/AGENTS.md`）并列。即生成器已经把 Orca 注入 Home 列为直接写入的安装目标。（来源：`scripts/entry_sync/targets.json`）
- F8. Orca 自身还有一条独立复制机制的痕迹：Orca Home 下 `.orca-resource-copies\AGENTS.md.json` 记录 `sourcePath = C:\Users\<user>\.codex\AGENTS.md`，说明 Orca 会（或曾经）把普通 Home 的 `AGENTS.md` 作为资源复制进注入 Home。（来源：该 JSON 文件内容）
- F9. Orca 对注入 Home 的 `config.toml` 维护独立的设置基线 `.orca-config-settings-baseline.json`（model、reasoning effort、approval、sandbox 等），且两份 `config.toml` 的 `hooks.state`、`projects` 条目互不相同——配置面并未共享，是有意分离。（来源：基线 JSON 与两份 `config.toml` 的 diff）
- F10. Orca 在 `AppData\Roaming\Orca\codex-real-home-hooks\` 保留了 `hooks.json.pre-orca`（普通 Home 曾经的 crux session-start hook 备份），普通 Home 现行 `hooks.json` 为空——Orca 接管过普通 Home 的 hooks 并留有回退备份。（来源：该目录与文件内容）

## 约束

- C1. 权威守恒律：无条件入口正文以固化时规模为上限，新增规则必须写明置换对象；任何桥接方案不得以扩写入口正文为手段。（来源：`authority/00-map.md` D4 守恒律）
- C2. 持久实现语言：任何沉淀为资产的同步/校验脚本只允许 Go/Python/TypeScript/Rust；不得新增 PowerShell/Batch/Shell 产品脚本。（来源：机器级全局规则，`entrypoints/agent-system.md`）
- C3. `entrypoints/agent-system.md` 是版本化来源，安装副本不是新的权威来源；桥接机制不得让安装副本反向定义权威。（来源：`README.md` 文件职责节）
- C4. 本问题的处置需按成本和风险选型，且属于会改变长期行为的配置面变化，选型结论需负责人确认。（来源：`authority/00-map.md`「后续确认」段、`README.md` 改变权威节）
- C5. Orca Home 的 `config.toml`、`hooks.json` 由 Orca 维护并有自己的基线机制；桥接方案不应顺带接管这两类文件的写入权。（来源：F9、F10）

## 未知

- U1. Orca 资源复制（F8）的触发时机与方向保证：是每次应用启动/终端创建时刷新，还是仅首次创建时复制一次？当 `.codex\AGENTS.md` 更新而 Orca 未重启时，注入 Home 何时收敛？只读检查无法确认，需查 Orca 文档或实测。
- U2. 双写并存的次序问题：entry_sync 直接写注入 Home（F7）与 Orca 自身复制（F8）同时存在；两者来源同链（entrypoints → .codex → orca home），内容会收敛，但是否存在 Orca 用旧缓存覆盖新写入的窗口未验证。
- U3. Codex 进程读取 `AGENTS.md` 的时点（仅会话启动时读，还是每轮读）未验证；这决定同步延迟的实际影响面。
- U4. 该注入 Home 路径（`AppData\Roaming\Orca\codex-runtime-home\home`）是否随 Orca 版本升级保持稳定，未见 Orca 侧承诺。
- U5. `authority/00-map.md` 记录的守恒上限为 LF 规范化 10241 字节，而当前入口 LF 规范化实测为 10314 字节；两者不一致的原因（上限已被合规更新、或存在未收口的超限）在本次范围外，未核验。

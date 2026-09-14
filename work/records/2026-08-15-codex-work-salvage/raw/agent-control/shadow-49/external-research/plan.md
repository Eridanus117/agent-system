# Orca 注入 `CODEX_HOME` 下的 Codex 权威入口桥接：实施计划

## 目标与选定方向

目标是在不产生第二套权威、不与 Orca 争夺运行目录写入权的前提下，让普通 Windows Codex 与当前 Orca 专用 `CODEX_HOME` 在新会话启动时都能取得 `entrypoints/agent-system.md` 的当前入口正文，并使漂移、路径变化和覆盖文件可被低成本发现。

选定方向是 `innovate.md` 的**方案 A：正式采用 Orca 受管普通文件副本**：

```text
entrypoints/agent-system.md
        │  既有安装/投影责任
        ▼
C:\Users\<user>\.codex\AGENTS.md
        │  Orca 资源复制（运行目录唯一写者）
        ▼
当前 Orca CODEX_HOME\AGENTS.md
```

仓库继续拥有版本化源、目标声明、生成物和只读校验；不新增向用户目录或 `%APPDATA%` 写入的命令。该方向是研究产物中的推荐，不替代负责人的产品决定或权威确认。

## 明确不做

- 不修改 Orca 启动链、Hooks、Plugins、权限、配置或 session 状态。
- 不把普通入口或 Orca 副本升级为权威来源。
- 不新增符号链接、硬链接、后台 watcher、轮询、定时任务或第二个安装器。
- 不承诺覆盖任意第三方宿主或任意 `CODEX_HOME`；第一版只覆盖当前 Orca runtime home，并为路径变化设置失效信号。
- 不在桥接任务里顺带重写入口正文或修正 10,241/10,314 字节差异；该冲突需由有权事项单独收敛。

## 前置决定与阻塞

实施前需要负责人作出一个产品边界决定：是否正式采用当前 Orca 受管副本作为当前宿主桥接方案，并接受“当前固定 Orca runtime home + 路径变化即重新评估”的范围。若要求直接覆盖任意注入的 `CODEX_HOME`，本计划停止，返回 `innovate.md` 的方案 C（宿主启动前同步）与方案 B（仓库显式安装）重新比较。

同时要确认普通 `.codex/AGENTS.md` 的安装责任仍由现有入口维护流程拥有；本计划只负责第二跳和端到端校验，不掩盖第一跳缺失。

## 实施任务

### 1. 收敛当前权威中的桥接合同

在获得明确决定后：

- 更新 `authority/00-map.md` 的对应“后续确认”，明确替代“宿主路径仍未选型”的旧表述。
- 只在需要消除重复或冲突时同步调整 `authority/08-mvp-implementation-direction.md`；保留其历史授权和证据语义，不把本次推荐倒写成过去已经作出的决定。
- 写清四个边界：版本化源、普通入口中间副本、Orca 运行目录写入所有者、路径/刷新失效条件。
- 将证据等级限制为“当前样本一致 + 后续动态验收”；在动态门通过前不写“长期可靠”。

预计涉及文件：

- `authority/00-map.md`
- 可能的 `authority/08-mvp-implementation-direction.md`

### 2. 为现有 `entry_sync` 增加显式运行时只读校验

保持现有 `generate` 和 `--write-repository` 的安全边界不变，扩展 `check` 的只读能力：

- 提供一个显式运行时检查入口（例如 `check --runtime-codex-home`；最终命名遵循现有 CLI 风格）。只有调用者主动选择时才读取环境变量，避免普通 CI 因未设置 `CODEX_HOME` 失败。
- 校验 `$env:CODEX_HOME` 已设置、规范化后位于预期当前 Orca runtime home、目标 `AGENTS.md` 存在且是普通文件、没有抢占全局层的非空 `AGENTS.override.md`。
- 将运行时 `AGENTS.md` 与 `entrypoints/agent-system.md`、普通 `.codex/AGENTS.md` 做 LF 规范化内容比较，并分别报告“第一跳漂移”或“第二跳漂移”。
- 读取 `.orca-resource-copies/AGENTS.md.json` 作为诊断证据；在没有 Orca 正式合同前，标记缺失/格式变化为清晰警告和重新评估信号，不把私有标记格式变成不可升级的硬依赖。
- 输出解析后的实际路径与各文件规范化哈希，但不输出配置、凭据或无关目录内容。
- 遇到缺失、路径变化、override 抢占或内容漂移时返回非零；绝不自动覆盖或修复 installed 文件。

预计涉及文件：

- `scripts/entry_sync/__main__.py`
- `scripts/entry_sync/core.py`
- `scripts/entry_sync/README.md`
- 若需要声明诊断元数据或路径范围：`scripts/entry_sync/targets.json`

### 3. 增加与风险相称的单元测试

在临时目录和 mock 环境中覆盖：

- 当前 `CODEX_HOME` 与声明 Orca 目标一致且三份内容一致时通过。
- `CODEX_HOME` 未设置、指向非预期位置或包含路径逃逸时失败。
- runtime `AGENTS.md` 缺失、不是普通文件、内容漂移时失败。
- 非空 `AGENTS.override.md` 出现时失败并说明它会优先于 `AGENTS.md`。
- 普通 `.codex/AGENTS.md` 已漂移与只有 Orca 副本漂移能被区分。
- 来源标记存在且 sourcePath 正确时给出诊断；缺失、不可解析或指向其他源时给出约定等级的警告/失败结果。
- 新功能全程不写 home、`%APPDATA%` 或 runtime 目标；现有“copy target 不读写 installed destination”和路径 containment 测试继续通过。

预计涉及文件：

- `tests/test_entry_sync.py`
- 若命令行输出契约需要独立覆盖，可新增同目录 Python 单元测试文件；不新增 PowerShell、Batch 或 Shell 脚本。

### 4. 补充维护与失败处理说明

在 `scripts/entry_sync/README.md` 中记录一个最小操作闭环：

1. 修改只能从 `entrypoints/agent-system.md` 开始。
2. 生成并检查仓内投影。
3. 由已有安装责任更新普通 `.codex/AGENTS.md`。
4. 让 Orca 的资源管理流程维护专用 home 副本；仓库工具只观察。
5. 运行普通 installed 检查和显式 runtime 检查。
6. 新会话才重新构建 Codex 指令链；已启动会话不作为刷新验收。
7. 路径、来源标记或内容漂移时停止声称桥有效，保留最后可用副本，不手工抢写 Orca 文件，并升级到方案重新评估。

该文档不声称 Orca 的内部刷新保证；只记录本机当前可重复验证的接口和失效信号。

### 5. 静态验证

在不写 installed 目标的前提下运行：

```text
python -B -m unittest tests.test_entry_sync
python -B -m scripts.entry_sync check --scope repository
python -B -m scripts.entry_sync check --scope installed
python -B -m scripts.entry_sync check --runtime-codex-home
```

如果完整仓库文档指定了更大的 Python 测试命令，再运行与改动风险相称的现有测试集合。所有命令都设置禁用 bytecode 写入，或在已授权构建目录内运行，避免制造范围外文件。

静态验收记录至少包含：

- 实际 `CODEX_HOME`；
- source、普通入口、runtime 入口的规范化哈希；
- override 检查；
- 来源标记诊断；
- 命令退出码；
- `git status --short` 证明没有写入 installed 目标或非预期文件。

### 6. 用下一次真实入口更新完成动态验收

不为测试伪造或篡改权威正文。等待下一次已经获准的真实 `entrypoints/agent-system.md` 更新，在同一维护闭环中：

- 确认普通入口完成投影。
- 观察 Orca 受管副本是否在约定时点刷新；记录刷新前后哈希和来源标记状态。
- 经明确授权从 Orca 启动一个全新、只读、最小功能的 Codex 会话，确认本次实际 `CODEX_HOME` 与目标一致，并让会话报告其全局/项目指令来源或一条可唯一识别的已批准入口规则。
- 会话结束后核验仓库、配置和 installed 文件没有被测试本身修改。

只有该门通过，证据才从“当前静态样本一致”升级到“至少一次真实更新与新会话加载有效”。它仍不等于长期自动同步可靠或产品长期依赖。

### 7. 收口与回退

- 把通过/失败证据写回获授权的远端任务合同，并由 `issue-workflow` 判断父目标条件；本影子产物本身不代替远端验收。
- 若静态或动态门失败，保留最后可用的 Orca `AGENTS.md`，不要删除或用仓库工具强行覆盖；冻结“已可靠桥接”的结论，记录失败属于第一跳、第二跳、路径还是加载行为。
- 代码/文档回退只撤销本次仓库变更；运行目录仍交给 Orca 管理。
- 若失败命中 `innovate.md` 的翻转条件，重新比较方案 C 与 B，不在修复过程中临时引入 wrapper、link 或第二写者。

## 数据、API、兼容与迁移说明

- 不引入数据库、网络 API 或数据迁移。
- 现有 `targets.json` schema 尽量保持 version 1；仅当确需声明 runtime 诊断字段时才升版，并为旧配置给出明确错误而非猜测默认值。
- 现有 `generate`、`check --scope repository`、`check --scope installed` 的行为和退出码保持兼容。
- 新运行时检查是显式 opt-in；普通非 Orca 环境不受影响。
- Windows 路径比较需处理大小写和规范化，但不能解析后越过获准根目录。
- 入口正文仍以 UTF-8 和 LF 规范化比较；不把 CRLF 物理差异当作漂移。

## 主要风险与应对

| 风险 | 应对 |
| --- | --- |
| Orca 资源复制只是实现细节 | 来源标记先作诊断；路径/格式变化触发重新评估，不声称跨版本保证 |
| 固定 runtime home 失效 | 显式对照实际 `CODEX_HOME`；不静默检查旧路径 |
| 普通入口先漂移 | 三方比较区分第一跳与第二跳，桥接验收不掩盖源安装失败 |
| `AGENTS.override.md` 抢占 | 运行时检查把非空 override 作为失败信号 |
| 两个写者相互覆盖 | 仓库工具保持只读 installed；Orca 是 runtime 唯一写者 |
| 已启动会话继续用旧指令链 | 动态验收只用新会话；文档明确每次运行构建一次 |
| 入口体积权威与实测不一致 | 单独升级，不在桥接改动中“顺手修正” |

## 完成定义

以下条件全部成立才可称“当前 Orca 启动路径的桥接方案已交付验收”：

1. 负责人已明确选择 Orca 受管副本，且根权威不再同时保留“仍未选型”的冲突表述。
2. 版本化源、普通入口、Orca runtime 副本及各自写入所有者在文档中唯一明确。
3. 现有生成器仍不写 installed 目标；显式 runtime 检查能发现路径、override、来源和两跳内容漂移。
4. 单元测试与仓库/installed/runtime 静态检查通过，且没有范围外文件变化。
5. 至少一次已授权的真实入口更新证明 Orca 副本会刷新，随后一个全新 Orca Codex 会话证明正确入口被加载。
6. 失败、回退、路径变化和重选方案的触发条件可操作。
7. 结论如实停在所获证据等级；没有把一次样本成功表述为长期依赖。

若只完成 1–4，则结论应写为“桥接合同和静态验证已完成，动态验收待下一次真实更新”，不能宣称完整闭环结束。

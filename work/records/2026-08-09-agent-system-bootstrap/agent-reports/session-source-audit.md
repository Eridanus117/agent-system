# 当前 Orca / Codex Session 原始记录来源审计

> 审计时间：2026-08-09 12:29–12:38（America/New_York）
> 范围：只读核验当前根 Session、其 Codex 多 Agent 子 Session、以及 Orca 的派生解析缓存。
> 未做：没有复制、修改、截断或提交任何原始 Session；没有读取或修改 `auth.json` 等凭据文件；没有修改权威。

## 结论

当前根 Session 的实际 Codex 原始事件记录是一个仍在追加的 rollout JSONL：

```text
C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home\sessions\2026\08\07\rollout-2026-08-07T07-08-48-019fdbe9-4f7e-79d1-95d4-25c7a83cff69.jsonl
```

- 根 `thread_id` / `session_id`：`019fdbe9-4f7e-79d1-95d4-25c7a83cff69`；
- `CODEX_HOME`：`C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home`；
- `session_meta` 表明：`source=cli`、`thread_source=user`、`originator=codex-tui`、`cli_version=0.146.0`；
- Orca 的 `ai-vault\session-parse-cache.json` 中有一个匹配条目，其 `session.filePath` 和 `session.codexHome` 分别与上述 rollout 和当前 `CODEX_HOME` 完全一致。这是派生缓存对原始来源的直接指向，不是另一份完整原始记录。

根 rollout 不是整个多 Agent 工作的全部原始记录。当前批次核验时，根 Session 有 25 个直接子 Session；每个子 Session 都有自己的 rollout JSONL，并通过首条 `session_meta.payload.parent_thread_id` / `forked_from_id` 指回根 Session。没有发现更深层后代。若研发记忆需要追溯多 Agent 推演，索引必须覆盖这 25 个子文件，不能只登记根文件。

## 观察快照

根 rollout 在审计期间仍由 Codex 写入，以下数字是时间点事实，不是终态：

- 2026-08-09 12:37:58 -04:00 开始结构扫描时：39,526,712 bytes；
- 扫描结束时：39,528,441 bytes（约 37.70 MiB），扫描期间增加 1,729 bytes；
- 读取到 17,107 条完整 JSONL 记录，逐行 `ConvertFrom-Json` 错误为 0；
- 顶层记录：`event_msg` 8,952、`response_item` 7,851、`turn_context` 186、`world_state` 55、`inter_agent_communication_metadata` 37、`compacted` 25、`session_meta` 1；
- `message` 记录角色：`developer` 37、`user` 184、`assistant` 659；没有观察到名为 `system` 的消息角色；
- 工具结果至少包括 `custom_tool_call_output` 1,828、`function_call_output` 226、`mcp_tool_call_end` 64，另有 patch、web search 和任务事件；
- 2026-08-09 约 12:36 的父子图快照：25 个直接子 rollout，共 47,639,324 bytes；根加子文件当时共 87,073,352 bytes。文件仍可能增长。

Orca 派生缓存：

```text
C:\Users\<user>\AppData\Roaming\orca\ai-vault\session-parse-cache.json
```

匹配条目保存了根 Session 的标题、工作目录、原始 `filePath`、`codexHome`、消息计数、`lastUserPrompt`、恢复命令及 5 条截断的预览消息。它因此也含有会话正文片段，但只是可重建、会变化的 UI/解析缓存；不应当作为原始层或长期追溯锚点。该条目当时报告 `subagentTranscriptCount=0`，而 rollout 元数据图实际找到了 25 个子 Session，说明也不能只依赖这个缓存字段发现 Codex 多 Agent 转录。

## 格式与内容边界

rollout 是逐行 JSON 对象。当前所有已解析行的顶层字段均是：

```text
timestamp, type, payload
```

它是平台事件日志，不是面向人的整理稿，也不能承诺保存模型内部发生的一切。当前文件包含 `compacted` 事件，并含有部分 `reasoning` 的摘要或 `encrypted_content`；因此“有原始 rollout”不等于存在可读且完整的内部思维链。

### 是否包含系统提示

包含系统级运行指令，但在当前序列化格式中主要表现为 `developer` 消息，而不是 `role=system`。不输出正文的存在性扫描观察到：

- `You are Codex` 身份指令；
- 项目 `AGENTS.md` 指令；
- `<skills_instructions>`；
- `<permissions instructions>`；
- `<multi_agent_mode>`；
- `<environment_context>`。

这些块会因恢复、上下文重建或子任务而重复出现，所以不能用出现次数推断独立决定次数。

### 是否包含工具输入与输出

包含。除用户和 Agent 消息外，根 rollout 保存了工具调用参数、shell/函数/MCP 输出、patch 结果、Web 搜索事件、Agent 协作事件及任务状态。任何工具曾经打印的本地文件内容、环境值或外部结果，都可能原样进入记录。

### 是否包含可能敏感信息

应当默认按敏感原始记录处理。已经确认它至少承载：

- 用户原话、Agent 回答及部分推理摘要；
- 系统/开发者/项目指令和权限、工作区、模型等运行上下文；
- 本机用户名和绝对路径、私有仓库地址等环境信息；
- 工具输入输出、补丁内容、URL 和形似邮箱的字符串；
- Orca 多 Agent 的任务文本、交接和活动元数据。

只做了不输出匹配值的保守词形扫描。5 行命中了“可能像访问令牌”的宽松模式，但 5 行全部同时位于 `reasoning.encrypted_content` 字段；密文随机命中不能证明存在真实凭据。相反，没有命中也不能证明安全，因为任意工具输出都可能带入其他格式的秘密。因此不应把词形扫描当作脱敏或安全证明，也不应把 raw rollout、Orca 预览缓存或其大段内容直接提交到 Git。

## 最小索引建议

当前先建立“指针清单”，不要盲目复制约 87 MB 的根/子原始内容。每个 rollout 只登记：

```yaml
record_kind: codex-rollout-jsonl
thread_id: <session_meta.payload.id>
session_id: <session_meta.payload.session_id>
parent_thread_id: <session_meta.payload.parent_thread_id | null>
forked_from_id: <session_meta.payload.forked_from_id | null>
agent_path: <session_meta.payload.agent_path | null>
codex_home: <当前 CODEX_HOME>
source_path: <绝对路径>
source_path_relative_to_codex_home: sessions/YYYY/MM/DD/<filename>
source_state: active | closed | missing
observed_at: <带时区时间>
bytes_at_observation: <整数>
created_at: <文件时间>
last_write_at: <文件时间>
sha256: null  # active 时不计算；关闭且不再增长后再填
content_classification: sensitive-raw-session
```

可读研发记忆引用具体证据时，优先保存以下定位信息，不复制事件正文：

- `thread_id`；
- 事件 `timestamp`；
- `payload.type`；
- 可用时保存 `turn_id`、`id`、`call_id`；
- 没有稳定事件 ID 时，再保存观察时的 JSONL 行号，并注明它依赖该文件版本；
- 工具证据用同一个 `call_id` 关联调用与输出；
- 子 Agent 报告用 `parent_thread_id + agent_path + child thread_id` 关联。

这样可以让人或后续 Agent 按需回到原始事件，同时避免把系统提示、工具输出和潜在秘密默认装入上下文。Orca 的 `session-parse-cache.json` 可以帮助发现路径，但索引不应依赖其预览正文或把它当作稳定来源。

索引不是备份。当前没有核验 Orca/Codex 对 rollout 的删除、迁移或保留策略；如果以后确认原始源会被自动清理，再单独决定是否需要受控归档、加密、访问边界和删除期限。本次不能据此复制原始文件。

## 可复查命令

以下命令只输出路径、元数据和结构计数，不输出消息正文或工具输出。

### 1. 定位根 rollout 并检查活动状态

```powershell
$rootThreadId = '019fdbe9-4f7e-79d1-95d4-25c7a83cff69'
$sessionRoot = Join-Path $env:CODEX_HOME 'sessions'
$rollout = rg --files $sessionRoot |
  rg --fixed-strings $rootThreadId |
  Select-Object -First 1

Get-Item -LiteralPath $rollout |
  Select-Object FullName, Length, CreationTime, LastWriteTime
```

### 2. 在不输出正文的情况下统计 JSONL 结构

活动 rollout 可能被写进程锁定；使用 `FileShare.ReadWrite` 做只读扫描，不要先复制文件绕过锁。

```powershell
$top = @{}
$payload = @{}
$roles = @{}
$lineCount = 0
$parseErrors = 0

$stream = [System.IO.FileStream]::new(
  $rollout,
  [System.IO.FileMode]::Open,
  [System.IO.FileAccess]::Read,
  [System.IO.FileShare]::ReadWrite
)
$reader = [System.IO.StreamReader]::new($stream)

try {
  while (($line = $reader.ReadLine()) -ne $null) {
    $lineCount++
    try {
      $obj = $line | ConvertFrom-Json -Depth 100
      $top[[string]$obj.type] = 1 + [int]$top[[string]$obj.type]
      if ($obj.payload) {
        $ptype = if ($obj.payload.type) { [string]$obj.payload.type } else { '<none>' }
        $payload[$ptype] = 1 + [int]$payload[$ptype]
        if ($obj.payload.role) {
          $roles[[string]$obj.payload.role] = 1 + [int]$roles[[string]$obj.payload.role]
        }
      }
    } catch {
      $parseErrors++
    }
  }
} finally {
  $reader.Dispose()
  $stream.Dispose()
}

[pscustomobject]@{ Lines = $lineCount; ParseErrors = $parseErrors }
$top.GetEnumerator() | Sort-Object Name
$payload.GetEnumerator() | Sort-Object Name
$roles.GetEnumerator() | Sort-Object Name
```

### 3. 核对 Orca 缓存指向同一原始文件

```powershell
$cachePath = Join-Path $env:APPDATA 'orca\ai-vault\session-parse-cache.json'
$cache = Get-Content -Raw -LiteralPath $cachePath | ConvertFrom-Json -Depth 50

$pair = @($cache.entries) |
  Where-Object { ($_ | ConvertTo-Json -Compress -Depth 50).Contains($rootThreadId) } |
  Select-Object -First 1
$entry = $pair[1]

[pscustomobject]@{
  SessionIdMatches = $entry.session.sessionId -eq $rootThreadId
  FilePathMatches = $entry.session.filePath -eq $rollout
  CodexHomeMatches = $entry.session.codexHome -eq $env:CODEX_HOME
  PreviewCount = @($entry.session.previewMessages).Count
  PreviewTruncated = $entry.session.previewMessagesTruncated
}
```

不要输出 `$entry.session.title`、`lastUserPrompt`、`previewMessages` 或 `resumeCommand` 的实际值。

## 未知与限制

- 根文件在扫描时仍增长；上述大小、行数和事件计数必须带观察时间理解。
- 没有计算活动文件的 SHA-256，因为计算过程中内容可变化，所得值不能充当稳定版本标识。
- 没有核验 Orca/Codex 的长期保留、清理或迁移策略。
- `state_5.sqlite`、`thread_history_1.sqlite`、`logs_2.sqlite` 等运行数据库存在，但本次没有读取其内容；没有证据可把它们定义为完整原始转录或稳定追溯来源。
- 没有进行正文级脱敏审阅；这是有意边界，避免审计本身扩散敏感内容。

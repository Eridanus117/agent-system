# 当前任务：最小启用 `grilling` 并用当前 Session 验收

> 归档说明：本任务已于 2026-08-09 完成；归档内容不再授权后续行动。

> 状态：已完成并通过验收；没有活动中的后续实施授权。
> 授权日期：2026-08-09。

## 目标

把 `agent-plugins` 仓中已经完成的 `grilling` `0.1.0` 安装到当前 Windows 的 Codex 与 Claude Code，并证明新会话能够发现它。

Codex 需要覆盖本机现有的两条启动路径：

1. 默认 `CODEX_HOME=C:\Users\<user>\.codex` 的普通 Windows 终端；
2. Orca 注入 `CODEX_HOME=C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home` 的宿主路径。

当前 Session 位于第二条路径。安装完成后，由负责人重新启动并恢复本 Session，作为真实加载验收。

## 已授权行动

- 从 `C:\Users\<user>\workspace\agent-plugins` 添加本地 `agent-plugins` marketplace；
- 只安装 `grilling@agent-plugins`；
- Claude Code 使用用户级安装；
- 分别从两条 Codex 路径及 Claude Code 启动一次全新、只读检查，只确认插件和 Skill 是否可发现；
- 记录安装状态、恢复入口、实际结果和回滚方法；
- 把本次权威与工作记录提交并推送到 `agent-control` 私有远程。

## 明确边界

- 不安装或更新其他插件；
- 不启用 Hook、MCP、自动调度、自动升级或上游月度同步；
- 不修改 WSL；
- 不把 `grilling` 视为最终的“升级思考”方法；
- 不在检查中强行启动一轮模拟问答；
- 不要求当前正在运行的 Session 热加载插件；
- 不顺带清理旧配置、旧 Skill 路径或旧仓内容。

## 验收条件

1. 两条 Codex 路径都显示 `grilling@agent-plugins` 已安装且启用；
2. Claude Code 显示同一插件已在用户范围安装且启用；
3. 三个全新只读上下文能够报告 `grilling` 可用及其显式调用名，但不擅自开始问询；
4. 负责人能够按当前线程 ID 恢复本 Session，恢复后再确认当前会话看到了新 Skill；
5. 回滚命令和本次改动均被记录。

## 当前 Session 恢复锚点

- 当前线程 ID：`019fdbe9-4f7e-79d1-95d4-25c7a83cff69`；
- 当前保存环境：Orca 专用 `CODEX_HOME`；
- 官方入口：`codex resume <SESSION_ID>`；
- 恢复时必须从同一 Orca 环境启动，或显式使用同一个 `CODEX_HOME`，否则普通终端的 Session 列表可能看不到这个线程。

## 已完成的实施与检查

- 普通 Windows Codex：已安装并启用 `grilling@agent-plugins` `0.1.0`；
- Orca Codex：已安装并启用同一版本；
- Claude Code：已在用户范围安装并启用同一版本；
- 普通 Codex 全新临时会话看到 `$grilling`，没有开始问询；
- Orca Codex 全新临时会话看到 `$grilling`，没有开始问询；
- Claude 正常能力清单下的全新非持久会话看到 `grilling:grilling`，没有开始问询。

Claude 的第一次检查使用了 `--tools ""`，返回 Skill 不存在。移除这个会隐藏 Skill 的测试参数后，立即通过。因此第一次结果是测试装置造成的假阴性，不是安装失败；以后不能用“关闭全部工具”来检查 Claude Skill 发现能力。

## 回滚方法

如需撤销，分别在对应环境运行：

```powershell
codex plugin remove grilling@agent-plugins --json
codex plugin marketplace remove agent-plugins --json

claude plugin uninstall grilling@agent-plugins --scope user
claude plugin marketplace remove agent-plugins
```

Codex 有两个独立的 `CODEX_HOME`，因此 Codex 的两条命令必须在普通 Windows 与 Orca 环境各运行一次。

## 最终恢复验收

负责人按恢复锚点重新进入了原 Session，并发送“已恢复”。恢复后的运行事实是：

- `CODEX_HOME` 仍为 `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home`；
- `CODEX_THREAD_ID` 仍为 `019fdbe9-4f7e-79d1-95d4-25c7a83cff69`；
- 本 Session 的可用 Skill 清单已经包含 `grilling:grilling`；
- Skill 来源为 Orca 专用插件缓存中的 `agent-plugins/grilling/0.1.0`；
- 恢复过程没有启动 grilling 问询，也没有扩大任务范围。

因此五项验收条件全部通过。本任务结束；`grilling` 现在是两端可用的首个方法 Plugin 样本，但仍不是完整“升级思考”方法，也没有获得自动介入或行为质量扩测授权。

下一步回到四领域和能力事项做 ROI 选择，不沿本任务自动安装其他插件或建设更多机制。

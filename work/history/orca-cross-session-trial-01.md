# 第一次真实跨 Session 交接

> 状态：试运行已结束；新 Session 在 5 分钟内没有交付报告，因此本次交接不能验收为成功。

## 本次要验证什么

一个全新 Orca Codex Session 能否只靠用户级入口和本仓文件，恢复目标、授权与边界，并完成一个真实的小任务。

真实任务只诊断 Orca Codex 的 `notify` 配置分层警告，不修复、不读取凭据或会话数据，也不扩展到其他配置。

完整任务约定已在启动前提交：`af3ae14`。

## 实际运行结果

- 新 Session 使用 Orca 注入的专用 `CODEX_HOME`；
- 启动提示只要求它按入口读取 `README.md`、`authority/00-map.md` 和当时的 `work/current.md`，没有复述诊断答案；
- 使用临时会话、只读沙箱，并禁用 Hooks、Plugins、Memories 和 Apps；
- 运行 304.2 秒后达到时间上限，被终止；
- 它没有输出报告，因此无法判断它是否正确恢复了任务，也无法评价报告质量；
- 没有自动重试；运行后没有残留新的 `codex exec` 进程；
- 本仓和四个受检查的入口、配置文件均未发生变化；
- token 用量未知，因为进程在输出使用统计前超时；
- 没有读取日志、Session 或历史来追查超时。

结论：边界控制和停止条件生效，但“跨 Session 能完成交接”本次没有得到证据。

## 当前 Session 的窄复核

虽然新 Session 没有交付报告，当前 Session 仍在已授权读取范围内复核了警告本身。

### 原因

把握程度：高。

1. 本次 Orca 进程的 `CODEX_HOME` 是 `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home`；
2. 因此该目录下的 `config.toml` 是 Orca Codex 的用户级配置；
3. 工作目录是 `C:\Users\<user>`，其中还有 `C:\Users\<user>\.codex\config.toml`；
4. Codex 把后者识别为项目级 `.codex\config.toml`；
5. OpenAI 官方配置参考明确说明：`notify` 出现在项目级配置时会被忽略，应放在用户级配置中。

### 实际影响

- 两个配置文件的第 10 行都存在顶层 `notify`，两处定义完全相同；没有输出定义内容；
- Orca 专用 `CODEX_HOME` 中的那一处仍是用户级配置，可以生效；
- 被忽略的是从当前工作目录额外发现的重复项目级定义；
- 所以目前证据指向“产生警告噪声”，而不是“Orca 丢失通知配置”；
- 普通 Windows Codex 未改写 `CODEX_HOME` 时，`C:\Users\<user>\.codex\config.toml` 本身是用户级配置，不属于这次重复分层情形。

### 方案和成本

| 方案 | 收益 | 成本或风险 | 当前判断 |
|---|---|---|---|
| 保持现状 | 零改造；两种启动方式各自仍有用户级 `notify` | Orca 从用户目录启动时继续出现警告 | 推荐 |
| 避免从用户目录启动 Orca 任务 | 可能避开这次重复发现 | 增加启动约束，是否覆盖所有路径尚未验证 | 当前不值得 |
| 重分配或删除两处 `notify` | 可以消除重复来源 | 容易让普通 Windows 或 Orca 其中一路失去通知 | 不做 |
| 向 Orca 或 Codex 上游反馈 | 可能改善重复配置的提示或处理 | 需要复现、沟通和等待 | 只有警告持续造成实际成本时再做 |

当前建议：不修复。只有实际通知失效，或这条警告持续干扰自动化输出时，再运行一次只检查“通知是否触发”的小实验。

官方依据：OpenAI [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic) 与 [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference)。

## 当时的下一决策点

本次失败可能来自启动或模型等待，也可能来自任务执行；在不读日志、不追加实验的边界内无法区分。

负责人随后批准改用 Orca 原生 TUI 和结构化终端读写进行一次可观察重试。

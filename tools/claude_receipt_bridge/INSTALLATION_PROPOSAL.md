# 安装提案：Claude 正向回执桥

> 状态：本提案已由关联 [#208（L1 Hook 正向回执）](https://github.com/Eridanus117/agent-control/issues/208)的负责人决定消费并完成安装；保留本文作为原始安装边界与回退依据。关联 [#225（事件驱动唤醒端到端接通）](https://github.com/Eridanus117/agent-control/issues/225)新增的前台 `wake` 消费模式不要求修改现有 Hook 配置，本文件也不授权替换已安装二进制或新增 OS 服务。

## 建议决定

建议只在一个受监督 Orca Claude worker 样本中试装，不覆盖现有 Hook，不扩大到所有 Claude Session。通过后仍只支持“当前安装效果样本”，不表示产品采用或长期依赖。

## 安装对象

建议把经当前 PR head 构建并核对哈希的单一二进制放到固定位置：

```text
C:\Users\<user>\AppData\Local\agent-control\claude-receipt-bridge.exe
```

不安装 PowerShell、Batch 或 Shell 脚本。原始安装样本中的二进制只含 `hook` 与 `listen` 两个固定模式，没有 URL、文件路径或任意命令参数；后续源码的 `wake` 模式继续固定 loopback 端点，只从环境读取精确 Orca Run ID，并在前台运行。

## 用户级 Hook 配置提案

以下对象应当分别追加到现有 `hooks.UserPromptSubmit`、`hooks.Stop` 和 `hooks.TaskCompleted` 数组；不得用整段示例覆盖 `C:\Users\<user>\.claude\settings.json` 的其他现有配置。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:\\Users\\<user>\\AppData\\Local\\agent-control\\claude-receipt-bridge.exe",
            "args": ["hook"],
            "timeout": 1
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:\\Users\\<user>\\AppData\\Local\\agent-control\\claude-receipt-bridge.exe",
            "args": ["hook"],
            "timeout": 1
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:\\Users\\<user>\\AppData\\Local\\agent-control\\claude-receipt-bridge.exe",
            "args": ["hook"],
            "timeout": 1
          }
        ]
      }
    ]
  }
}
```

配置使用 Claude Code 2.1.229 当前支持的 exec form（固定 `.exe` 加单一 `hook` 参数）。它故意不使用原生 HTTP Hook，因为原生 HTTP Hook 会把完整 Claude Hook JSON 直接作为 POST 正文，不能满足四字段最小载荷。

## 受监督样本的启动顺序

1. 生成仅用于本次样本的随机 token；协调者与目标 Claude 父进程获得同一个 `AGENT_CONTROL_RECEIPT_TOKEN`，不把 token 写入 settings、日志或 PR。
2. 协调者先运行固定二进制的 `listen` 模式，并以机器方式读取 stdout JSONL。
3. 启动目标 Claude worker 前，由受信任的 launcher 把准确的 `AGENT_CONTROL_TASK_ID`、`AGENT_CONTROL_DISPATCH_ID` 和 token 注入父进程环境。不要从提示、Hook stdin、transcript 或最近 Session 推断这些值。
4. 只触发一个受监督派发，核对 `UserPromptSubmit` 与 `Stop`；仅在样本自然使用 Claude Task 时核对 `TaskCompleted`，不为制造证据扩大任务。
5. 回读 Claude debug 面，确认 Hook 无可见错误；对比回执延迟、重复数、准确 Dispatch 绑定和正常停止行为。
6. 样本结束后停止 listener、清除本次环境变量；未获进一步决定不扩大安装面。

## 停止门与回退

命中任一项即停止样本并移除本次新增的三个 handler：

- 任一回执包含四字段之外的数据，或 task／dispatch 来自 Hook 输入而非 launcher 绑定；
- 事件发往非 loopback 地址、经过代理／重定向，或可由参数改变端点；
- 普通交互出现可见延迟、Hook 错误或停止／完成语义改变；
- 同一自然事件重复回执导致协调者执行两次动作；
- listener 缺席被错误解释为 Provider 未开始／未完成；
- 现有 Orca Claude Hook 与本 handler 产生不可接受的重复、顺序或性能影响。

回退只删除本次新增 handler 与固定二进制；不要覆盖或重建整份 settings。GitHub 合同、Orca 运行事实和外部负事实检查保持原状。

## 仍待负责人确认与安装后验证

- 是否批准在一个受监督样本追加上述用户级 Hook；
- 由哪个可信 launcher 注入每个 worker 的 task／dispatch 环境绑定；
- listener stdout 由哪个当前协调进程消费，以及重复回执的消费规则；
- 本机当前已有 Orca Claude Hook 的并存成本是否可接受。

本 PR 只验证源码、固定协议和本地合成端到端路径；真实用户级 settings、固定安装路径、自然 Claude 事件、并发 worker 和安装后卸载回读均未执行。

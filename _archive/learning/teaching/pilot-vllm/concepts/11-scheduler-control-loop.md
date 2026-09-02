# Scheduler 控制循环

<!-- markdownlint-disable MD013 -->

## id

`vllm.scheduler-control-loop`

## outcome

能沿 `schedule → execute_model → update_from_output` 追踪 running/waiting、每请求调度 token 数与完成资源释放。

## requires

- `vllm.continuous-batching`

## contrastsWith

- `model-runner-input-packing`：scheduler 决定谁进入本轮，model runner 决定怎样打包设备输入。

## assets

- [关联 #170（vLLM 学习单元）：vLLM 的连续调度，L39–L52](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L39-L52)
- [vLLM `v0.27.1` Scheduler](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/sched/scheduler.py)
- [vLLM `v0.27.1` EngineCore](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core.py)

## checks

**1（应用）**：初始 `running=[A]`、`waiting=[B]`，本轮 A 完成且 B 可准入；按控制循环写出调度前、执行后、更新后的集合与应释放资源。评分：2 分＝三时点和 A 的 KV 释放都正确；1 分＝集合变化正确但遗漏释放或混淆时点；0 分＝让完成的 A 留在 running 或由 model runner 决定准入。

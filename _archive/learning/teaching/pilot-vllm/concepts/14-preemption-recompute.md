# Preemption 与 recomputation

<!-- markdownlint-disable MD013 -->

## id

`vllm.preemption-recompute`

## outcome

当 KV 分配失败时，能追踪 vLLM V1 选择牺牲请求、释放块、重置计算进度、回到 waiting 并在恢复时重算的状态变化。

## requires

- `vllm.kv-slot-allocation`

## contrastsWith

- `request-cancellation`
- `swap-preemption`
- `kv-offloading`

## assets

- [关联 #170（vLLM 学习单元）：抢占定义与当前 V1 行为，L193–L227](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L193-L227)
- [vLLM `v0.27.1` V1 指南](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/usage/v1_guide.md)

## checks

**1（辨析）**：KV 池满时 B 被抢占；按顺序写出 B 的 blocks、状态、`num_computed_tokens` 与队列位置变化，并判断是否发生 GPU→CPU swap。评分：2 分＝释放 blocks、`PREEMPTED`、进度归零、回 waiting 前部且无旧式 swap 全部正确；1 分＝五项中答对三至四项；0 分＝把 B 当成取消或保留原 KV 直接继续。

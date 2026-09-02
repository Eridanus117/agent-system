# Token budget 与 chunked prefill

<!-- markdownlint-disable MD013 -->

## id

`vllm.token-budget-chunked-prefill`

## outcome

给出 `max_num_batched_tokens`、decode 请求数与剩余 prompt 长度后，能计算本轮 token 分配及下一轮尚余 prefill。

## requires

- `vllm.prefill-workload`
- `vllm.decode-workload`
- `vllm.scheduler-control-loop`

## contrastsWith

- `phase-separated-batching`：统一 token 进度不等于 prefill/decode 没有不同计算形态。

## assets

- [关联 #170（vLLM 学习单元）：统一调度与 chunked prefill，L157–L184](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L157-L184)
- [vLLM `v0.27.1` 优化文档](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/configuration/optimization.md)

## checks

**1（应用）**：预算为 8，两个 decode 请求各需 1 token，另有 10-token prompt；按 decode 优先写出本轮分配和 prompt 剩余量。评分：2 分＝`1+1+6` 且剩 4；1 分＝总和为 8 但没有保留两个 decode；0 分＝安排 10 个 prompt token或声称请求不能推进。

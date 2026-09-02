# Prefill 工作负载

<!-- markdownlint-disable MD013 -->

## id

`vllm.prefill-workload`

## outcome

从请求 trace 中识别尚未计算的 prompt token，并预测增加 prompt 工作量首先影响哪段用户可见延迟。

## requires

- `vllm.autoregressive-loop`

## contrastsWith

- `vllm.decode-workload`

## assets

- [关联 #170（vLLM 学习单元）：Prefill 定义，L147–L155](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L147-L155)
- [vLLM `v0.27.1` 优化文档：Chunked Prefill](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/configuration/optimization.md)

## checks

**1（应用）**：给定“长 prompt 尚有 12 token 未计算、请求还没有首 token”的 trace，指出本轮属于什么工作负载，并说明它对 TTFT 的直接影响。评分：2 分＝识别 prefill、未算 prompt 与 TTFT 三点；1 分＝识别阶段但延迟归因不完整；0 分＝判为普通 decode。

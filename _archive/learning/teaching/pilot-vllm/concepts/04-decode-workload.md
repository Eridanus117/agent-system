# Decode 工作负载

<!-- markdownlint-disable MD013 -->

## id

`vllm.decode-workload`

## outcome

从请求 trace 中识别 decode 轮次，并追踪新 token 如何利用已有 KV 继续生成。

## requires

- `vllm.autoregressive-loop`
- `vllm.kv-cache-purpose`

## contrastsWith

- `vllm.prefill-workload`

## assets

- [关联 #170（vLLM 学习单元）：Decode 定义，L147–L155](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L147-L155)
- [vLLM `v0.27.1` GPU model runner](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/worker/gpu_model_runner.py)

## checks

**1（应用）**：给定“已有 20 个已计算 token，本轮调度 1 个新 token”的 trace，画出本轮读取和追加的状态。评分：2 分＝正确标出读取历史 KV、处理新 token、追加新 K/V；1 分＝三项中答对两项；0 分＝声称重算全部 20 个 token。

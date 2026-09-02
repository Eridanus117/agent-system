# TTFT、ITL 与 TPOT

<!-- markdownlint-disable MD013 -->

## id

`vllm.latency-metrics`

## outcome

看到 TTFT 或 ITL/TPOT 的异常曲线时，能先把问题定位到首 token 路径或后续 token 路径，并列出需继续核验的调度工作量。

## requires

- `vllm.prefill-workload`
- `vllm.decode-workload`

## contrastsWith

- `throughput`：总体 token 吞吐不能替代单请求首 token 或相邻 token 延迟。

## assets

- [关联 #170（vLLM 学习单元）：共同模型中的指标边界，L11–L19](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L11-L19)
- [关联 #170（vLLM 学习单元）：两种负载的调度取舍，L157–L172](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L157-L172)

## checks

**1（辨析）**：场景 A 是首 token 明显变慢但后续间隔稳定，场景 B 是首 token 正常但后续间隔出现尖峰；分别选择优先查看的 prefill/decode 工作量并说明理由。评分：2 分＝A→prefill/TTFT、B→decode/ITL 且理由正确；1 分＝映射正确但理由缺失；0 分＝两者颠倒或只看总吞吐。

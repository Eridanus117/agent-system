# TP × PP 二维拓扑

<!-- markdownlint-disable MD013 -->

## id

`vllm.tp-pp-topology`

## outcome

给出 TP 与 PP 大小时，能计算 worker GPU 数、画出每个 PP stage 内的 TP group，并区分层内 collective 与 stage 间 activation 通信。

## requires

- `vllm.tensor-parallelism`
- `vllm.pipeline-parallelism`

## contrastsWith

- `tp-plus-pp`：worker 数通常是 `TP × PP`，不是两者相加。

## assets

- [关联 #170（vLLM 学习单元）：TP×PP 最小例子，L288–L303](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L288-L303)
- [vLLM `v0.27.1` 并行部署文档](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/serving/parallelism_scaling.md)

## checks

**1（辨析）**：配置 `TP=4, PP=2`；计算 worker GPU 数，并分别指出同一 stage 内和相邻 stage 间的主要通信。评分：2 分＝8 个 worker、stage 内 collective、stage 间 activation 三项正确；1 分＝只答对 worker 数和一种通信；0 分＝答 6 个 worker 或把拓扑解释成 8 份完整模型副本。

# Tensor parallelism

<!-- markdownlint-disable MD013 -->

## id

`vllm.tensor-parallelism`

## outcome

给出一层线性变换或 attention heads 的切分方式后，能判断每个 TP rank 保存与计算哪部分，以及结果在哪一步需要 collective。

## requires

`[]`

## contrastsWith

- `data-parallelism`：TP ranks 协作计算同一批请求，不是各自持有完整模型处理不同请求。
- `vllm.pipeline-parallelism`

## assets

- [关联 #170（vLLM 学习单元）：TP 定义与原语，L252–L286](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L252-L286)
- [vLLM `v0.27.1` parallel_state](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/distributed/parallel_state.py)
- [vLLM `v0.27.1` parallel linear layers](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/model_executor/layers/linear.py)

## checks

**1（应用）**：一个输出维为 8 的线性层按输出维切到 TP=2，写出每个 rank 的局部输出维，并说明需要完整输出时在哪类操作中组合。评分：2 分＝每 rank 4 维且指出 all-gather；1 分＝切分正确但 collective 错；0 分＝说每个 rank 各处理一半请求或仍保存完整输出权重。

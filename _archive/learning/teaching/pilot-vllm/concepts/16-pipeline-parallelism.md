# Pipeline parallelism

<!-- markdownlint-disable MD013 -->

## id

`vllm.pipeline-parallelism`

## outcome

给出 Transformer 层数与 PP stage 数后，能划分每个 stage 的层范围，并画出 stage 间 activation 传递。

## requires

`[]`

## contrastsWith

- `data-parallelism`
- `vllm.tensor-parallelism`

## assets

- [关联 #170（vLLM 学习单元）：PP 定义与实现，L252–L286](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L252-L286)
- [vLLM `v0.27.1` model layer utilities](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/model_executor/models/utils.py)

## checks

**1（应用）**：32 层模型按 0–31 编号并用 PP=2 均匀切分；写出两个 stage 的层范围与跨 stage 传输对象。评分：2 分＝`0–15`、`16–31` 且传 activation；1 分＝层范围或传输对象仅一项正确；0 分＝说两个 stage 都保存全部层或只传权重文件。

# 自回归推理循环

<!-- markdownlint-disable MD013 -->

## id

`vllm.autoregressive-loop`

## outcome

给出 prompt 长度与生成 token 数后，能画出首轮和后续生成轮次，并标出每轮新输入、历史状态与新输出。

## requires

`[]`

## contrastsWith

- `request-level-batching`：一次请求批次不是一次自回归生成迭代。

## assets

- [关联 #170（vLLM 学习单元）：共同模型，L11–L19](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L11-L19)
- [vLLM `v0.27.1` EngineCore](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core.py)

## checks

**1（应用）**：prompt 有 3 个 token，随后生成 2 个 token；画出产生这两个输出所需的两轮模型执行，并标出哪轮是 prefill、哪轮是 decode、每轮输入与已存在历史。评分：2 分＝两轮、阶段、输入和历史都正确；1 分＝轮次正确但混淆阶段、输入或历史；0 分＝把两个输出写成一次前向。

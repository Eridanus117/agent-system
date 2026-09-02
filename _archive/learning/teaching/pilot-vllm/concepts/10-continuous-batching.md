# Continuous batching

<!-- markdownlint-disable MD013 -->

## id

`vllm.continuous-batching`

## outcome

给出长短请求的剩余生成轮数后，能重排逐轮批次成员，使完成请求及时退出、等待请求在下一轮补位。

## requires

- `vllm.autoregressive-loop`

## contrastsWith

- `static-batching`
- `request-level-batching`
- `streaming-output`

## assets

- [关联 #170（vLLM 学习单元）：Continuous batching 定义，L21–L52](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L21-L52)
- [关联 #170（vLLM 学习单元）：批次时间线，L54–L73](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L54-L73)

## checks

**1（应用）**：A 还需 3 轮、B 还需 1 轮、C 等待且至少需 2 轮，批次上限为 2；写出接下来 3 轮的成员。评分：2 分＝`[A,B]→[A,C]→[A,C]` 且说明 B 完成后下一轮补位；1 分＝成员正确但补位时机理由错误；0 分＝让 C 等到 A 结束。

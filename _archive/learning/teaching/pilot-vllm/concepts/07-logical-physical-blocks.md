# 逻辑块与物理块

<!-- markdownlint-disable MD013 -->

## id

`vllm.logical-physical-blocks`

## outcome

给出 block size 与序列长度后，能画出逻辑块，并把它们放入任意不连续的物理块而不改变 token 顺序。

## requires

- `vllm.kv-fragmentation`

## contrastsWith

- `os-virtual-memory`：这里只借用分页映射思想，不把 KV 交给操作系统页表管理。

## assets

- [关联 #170（vLLM 学习单元）：逻辑／物理块定义，L82–L101](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L82-L101)
- [PagedAttention 论文入口（由关联 #170 引用）](https://arxiv.org/abs/2309.06180)

## checks

**1（应用）**：block size 为 4，序列有 9 个 token，可用物理块为 P7、P1、P5；画出逻辑块 L0–L2 到物理块的合法映射并标出尾块空位。评分：2 分＝3 个逻辑块、任意不连续映射、尾块 3 个空位均正确；1 分＝块数正确但映射或空位错误；0 分＝要求物理块连续或块数错误。

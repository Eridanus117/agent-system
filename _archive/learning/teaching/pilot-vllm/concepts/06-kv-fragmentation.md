# KV 分配中的预留与碎片

<!-- markdownlint-disable MD013 -->

## id

`vllm.kv-fragmentation`

## outcome

给出请求的预留长度、实际长度与空闲区布局后，能计算浪费并区分内部碎片和外部碎片。

## requires

- `vllm.kv-cache-purpose`

## contrastsWith

- `capacity-exhaustion`：总容量不足与“总空闲足够但缺连续区间”不是同一故障。

## assets

- [关联 #170（vLLM 学习单元）：碎片问题，L90–L101](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L90-L101)
- [关联 #170（vLLM 学习单元）：分页 KV 最小例子，L120–L137](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L120-L137)

## checks

**1（应用）**：请求按最大 32 token 预留、实际使用 7 token；另有总计 8 个空闲 slot 分成 3/3/2 三段。计算预留未用量，并判断“需要连续 6 slot 却无法分配”体现哪类碎片。评分：2 分＝答出 25 个预留未用 slot 与外部碎片；1 分＝只答对一项；0 分＝两项都错。

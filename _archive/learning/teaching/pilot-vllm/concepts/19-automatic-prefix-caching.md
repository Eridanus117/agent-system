# Automatic Prefix Caching

<!-- markdownlint-disable MD013 -->

## id

`vllm.automatic-prefix-caching`

## outcome

在单 KV cache group／非 hybrid 的 block-aligned 本地 APC 范围内，给定请求 token 序列、block size 与 cache 状态，能算出最长可复用前缀，追踪 hash lookup、引用与驱逐，并判断命中对 prefill／TTFT、观测和租户隔离的实际影响。

## requires

- `vllm.kv-cache-purpose`
- `vllm.prefill-workload`
- `vllm.logical-physical-blocks`

## contrastsWith

- `vllm.paged-attention`：分页负责物理 K/V 的分配与寻址；prefix caching 负责让后续请求复用已经计算的前缀状态，本节例题限于完整物理块对齐。
- `semantic-cache`：APC 匹配从 token 0 开始的精确 token 前缀，不按语义相似度复用答案或中间状态。
- `kv-connector`：本地 APC 查同一 block pool；connector 才处理跨实例或外部 KV 的发现与搬运。

## assets

- [关联 #166（个人学习与 KB 内容）：vLLM Automatic Prefix Caching 叙事资产](../../../infra/vllm-automatic-prefix-caching.md)
- [vLLM `v0.27.1` APC 功能文档](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/features/automatic_prefix_caching.md)
- [vLLM `v0.27.1` prefix caching 设计](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/design/prefix_caching.md)
- [vLLM `v0.27.1` 本地命中入口](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_manager.py#L229-L295)
- [vLLM `v0.27.1` `prefix_match_unit`／`hash_block_size` 边界](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/config/cache.py#L56-L66)
- [vLLM `v0.27.1` hybrid partial-hit 入口](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_coordinator.py#L554-L598)

## checks

**1（应用＋辨析）**：在单 KV cache group／非 hybrid 的 block-aligned 本地 APC 中，给定 block size 为 4，已有 prompt `[A B C D][E F G H][I J]`，新请求分别为 `[A B C D][E F X Y]`与`[Q R S T][E F G H]`；闭卷计算各自命中 token 数，并解释命中块如何从 free queue 被 touch、请求结束后为何仍可能再次命中，以及该结果为什么不是 PagedAttention 或语义缓存自动提供的。评分：2 分＝给出 4 与 0、说明链式父 hash／本范围内的完整物理块、touch／ref count／延迟驱逐和 prefill-only 边界；1 分＝命中数正确但遗漏生命周期或混淆相邻机制；0 分＝从中间子串命中、把请求结束等同立即清空，或声称命中直接复用答案。

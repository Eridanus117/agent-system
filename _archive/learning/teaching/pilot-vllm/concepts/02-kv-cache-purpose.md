# KV cache 的用途与生命周期

<!-- markdownlint-disable MD013 -->

## id

`vllm.kv-cache-purpose`

## outcome

面对一条请求 trace，能指出 KV cache 保存的请求相关中间状态、增长与释放时机，并解释它省掉的重算。

## requires

- `vllm.autoregressive-loop`

## contrastsWith

- `model-parameters`：模型参数跨请求共享，KV cache 随单个请求的 token 历史变化。

## assets

- [关联 #170（vLLM 学习单元）：KV cache 定义，L82–L89](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L82-L89)
- [vLLM `v0.27.1` KVCacheManager](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_manager.py)

## checks

**1（检索）**：闭卷写出 KV cache 保存什么、何时新增、何时释放，以及若没有它 decode 会多做哪类计算。评分：2 分＝四项齐全且把 K/V 与参数分开；1 分＝答对两至三项；0 分＝把 KV cache 当成权重或响应文本缓存。

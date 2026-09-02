# KV slot 分配

<!-- markdownlint-disable MD013 -->

## id

`vllm.kv-slot-allocation`

## outcome

能把请求本轮新增 token 数换算成需要的 KV 块，并根据已有尾块余量与空闲池判断 `allocate_slots()` 能否成功。

## requires

- `vllm.kv-cache-purpose`
- `vllm.logical-physical-blocks`
- `vllm.scheduler-control-loop`

## contrastsWith

- `token-budget`：计算预算充足不代表 KV 物理块一定充足。

## assets

- [关联 #170（vLLM 学习单元）：KVCacheManager 分层，L103–L118](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L103-L118)
- [vLLM `v0.27.1` KVCacheManager](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_manager.py)

## checks

**1（应用）**：block size 为 4，请求尾块还剩 1 个 slot，本轮需新增 6 token，空闲池只有 1 块；计算需要几个新块并判断分配结果。评分：2 分＝先用尾块 1 slot、余 5 token 需 2 新块、因此失败；1 分＝判断失败但块数推导错误；0 分＝认为 1 个空闲块足够。

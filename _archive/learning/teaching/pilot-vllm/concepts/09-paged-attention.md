# PagedAttention 执行路径

<!-- markdownlint-disable MD013 -->

## id

`vllm.paged-attention`

## outcome

能从 query 出发，经 block table 与 slot mapping 追踪 attention 如何读取离散物理块中的历史 K/V，并指出分页仍保留的边界成本。

## requires

- `vllm.kv-cache-purpose`
- `vllm.block-table-slot-mapping`

## contrastsWith

- `prefix-caching`：分页负责寻址与分配，prefix caching 负责复用已计算块。
- `kv-offloading`：分页不等于跨设备搬运 K/V。

## assets

- [关联 #170（vLLM 学习单元）：PagedAttention 定义与边界，L82–L101](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L82-L101)
- [vLLM `v0.27.1` PagedAttention 算子入口](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/attention/ops/paged_attn.py)

## checks

**1（辨析）**：判断并修正命题“PagedAttention 把 KV 交给操作系统分页，所以自动消除全部碎片并提供 prefix caching”。评分：2 分＝指出专用 KV 块/内核、尾块仍有内部碎片、prefix caching 是独立职责三点；1 分＝指出其中一至两点；0 分＝接受原命题。

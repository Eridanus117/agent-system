# Block table 与 slot mapping

<!-- markdownlint-disable MD013 -->

## id

`vllm.block-table-slot-mapping`

## outcome

能用 block table 把一个逻辑 token 位置转换成物理 block ID 与块内 slot，并说明映射表不存放 K/V 张量本体。

## requires

- `vllm.logical-physical-blocks`

## contrastsWith

- `kv-tensor-storage`：block table 保存地址映射，设备缓存池才保存 K/V 数据。

## assets

- [关联 #170（vLLM 学习单元）：CPU 管理到 GPU 消费，L103–L118](https://github.com/Eridanus117/agent-control/blob/841aeadcfa0efa82b1ef5524b88f983eeeb15ca1/learning/infra/vllm-and-inference.md#L103-L118)
- [vLLM `v0.27.1` GPU block table](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/worker/gpu/block_table.py)

## checks

**1（应用）**：token 位置从 0 编号；block size 为 4，块表为 `L0→P7, L1→P1`。求逻辑 token 位置 6 所在的物理块和块内 slot，并说明真正 K/V 在哪里。评分：2 分＝P1、slot 2、K/V 在设备缓存池三项正确；1 分＝地址计算正确但存储位置错误；0 分＝把位置 6 映到 P7 或把表当 K/V 数据。

# 从 vLLM 读懂大模型推理基础设施

<!-- markdownlint-disable MD013 MD024 -->

> 适用对象：已经知道 vLLM 调度器大致做什么、准备沿源码继续学习的后端工程师。
> 核验基线：vLLM [`v0.27.1`](https://github.com/vllm-project/vllm/releases/tag/v0.27.1)，核验于 2026-08-12。
> 证据等级：本文的 vLLM 行为均经官方文档或该版本源码核验；概念起点另引用 PagedAttention 原论文。本文没有采用二手转述，也没有做 GPU 性能实测。

这份单元不从 API 用法讲起，而是追踪一条请求在三个约束之间怎样流动：每轮允许算多少 token、KV cache 还有多少块、一次前向要跨哪些设备。把这三条线串起来，continuous batching、PagedAttention、prefill/decode、抢占和模型并行就不再是五个孤立名词。

## 先建立一个共同模型

自回归推理不是“一次前向得到整段答案”，而是：

1. 先用整个 prompt 做一次上下文计算，得到首个输出和各层历史 token 的 K/V；
2. 随后每次把新 token 接到序列末尾，读取已有 K/V，再生成下一个 token；
3. 服务端在每一轮前向之间重新决定哪些请求进入本轮，以及它们各算多少 token。

因此常见指标自然分成两类：prefill 主要影响首 token 延迟（TTFT），decode 主要影响 token 间延迟（ITL/TPOT）。二者共用模型和 GPU，却有不同的计算形态与调度诉求。

## 1. Continuous batching：批次成员可以逐轮变化

### 是什么

**Static batching（静态批处理）**把一组请求组成一个批次后，通常让整批一起运行到完成；短请求先结束，留下的槽位也要等该批最长请求结束后才能被下一批使用。

**Continuous batching（连续批处理，也叫 iteration-level batching）**把调度边界放到生成迭代之间：本轮结束的请求立即退出，等待中的请求下一轮即可加入。这里“连续”不是一个 kernel 永不结束，而是批次成员不必在整段生成期间保持不变。

### 为何存在：解决长短请求不齐造成的空槽

LLM 的输出长度事前未知。若批次寿命由最长请求决定，短请求完成后的计算槽、KV cache 容量和排队时间都会浪费。逐轮重组批次可以：

- 及时释放完成请求的 KV blocks；
- 用新请求填补空位，提高一次模型前向中有效请求的数量；
- 让新请求不必等待旧批次全部完成，降低排队造成的首 token 延迟。

它的代价是调度器、batch metadata 和 KV block table 都必须支持动态增删，而不能假设一个固定、整齐的张量批次会一直存在。

### vLLM 具体怎么做

vLLM 把 continuous batching 列为核心能力。V1 的 `EngineCore` 持续驱动调度与模型执行；`Scheduler.schedule()` 每轮先看运行中请求，再看等待队列，在 `max_num_batched_tokens`、`max_num_seqs`、KV block 可用量等约束下形成新的 `SchedulerOutput`。完成请求会被移出并释放缓存，新请求随后可进入运行集合。

需要把两个层次分开：

- **请求如何进入本轮**是 scheduler 的决定；
- **本轮请求如何打包成设备输入**由 model runner 和 input batch 负责。

源码入口：

- [`vllm/v1/engine/core.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core.py)：看 engine core 的循环怎样把 `schedule → execute_model → update_from_output` 串起来；
- [`vllm/v1/core/sched/scheduler.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/sched/scheduler.py)：从 `Scheduler.schedule()` 看 `running`、`waiting`、token budget 和完成请求；
- [`vllm/v1/worker/gpu_model_runner.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/worker/gpu_model_runner.py)：搜索 `input_batch`、`block_table` 和 `num_scheduled_tokens`，看动态逻辑批次如何落到 GPU 输入。

### 最小例子

假设 A 还需 4 轮 decode，B 还需 2 轮，C 正在等待：

```text
静态批处理
轮次 1: [A, B]
轮次 2: [A, B]  <- B 完成
轮次 3: [A, _]  <- C 仍等整批结束
轮次 4: [A, _]  <- A 完成
轮次 5: [C, ...]

连续批处理
轮次 1: [A, B]
轮次 2: [A, B]  <- B 完成
轮次 3: [A, C]  <- C 立即补位
轮次 4: [A, C]
```

这只是请求成员变化的示意；真实 vLLM 还会同时考虑每个请求本轮的 token 数、KV 可用块、优先级、结构化输出、投机解码等约束。

### 常见误解

- **“连续批处理就是积攒请求后一次发出去。”** 那只是 request-level batching；continuous batching 的关键是生成迭代之间可以加入和移出请求。
- **“batch size 是一个固定数字。”** 在服务中它是随请求完成、到达和内存压力变化的结果；`max_num_seqs` 是上限之一，不是每轮必然达到的大小。
- **“流式返回就是 continuous batching。”** streaming 是输出接口语义；连续组批是执行调度语义，二者可以组合，但不是同一件事。
- **“PagedAttention 自动带来 continuous batching。”** 分页 KV 管理使动态批次更容易装入显存，但调度和内存管理仍是两个协作组件。

## 2. PagedAttention 与 KV cache：用块表解除“逻辑连续 = 物理连续”

### 是什么

在每一层 self-attention 中，历史 token 的 key/value 向量会在后续 decode 中反复使用。**KV cache**保存这些向量，避免为了生成每个新 token 都重算完整前缀；代价是缓存随序列长度增长，并且每个并发请求都要占用显存。

**PagedAttention**把一个请求逻辑上连续的 KV 序列切成固定 token 数的逻辑块，再通过 block table 映射到不必相邻的物理 KV blocks。attention kernel 按块表找到历史 K/V，类似操作系统页表把连续虚拟地址映射到离散物理页，但这里是 vLLM 自己管理的 KV 块与专用 kernel/后端，不是直接调用操作系统虚拟内存。

### 为何存在：解决预留、内部碎片与外部碎片

传统连续分配常为请求预留最大可能序列长度。实际输出若很短，预留未用部分形成**内部碎片**；请求不断完成和增长后，空闲显存虽多却缺少足够大的连续区间，又会形成**外部碎片**。KV cache 往往是可容纳并发请求数的直接瓶颈。

分页后的效果是：

- 序列增长到块边界时才追加物理块，不必预留最大长度；
- 相邻逻辑块可落在任意空闲物理块，避免为每个请求寻找大块连续空间；
- 在经典 full-attention 情况下，一个序列主要只在最后一个未填满块中留下内部碎片；
- 完整块还能用 hash、引用计数等机制支持 prefix caching 和跨请求共享。

块越大，block table 和 kernel 管理开销通常越低，但尾块浪费上界越高；块越小则相反。这是粒度权衡，不是“越小越好”。PagedAttention 原论文给出了问题定义、逻辑/物理块表和经典设计边界；当前实现细节应以当前源码为准。

### vLLM 具体怎么做

当前 V1 中，CPU 侧管理与 GPU 侧消费大致分为四层：

1. `Scheduler` 请求本轮所需的 KV slots；
2. `KVCacheManager.allocate_slots()`计算需要的新块，并通过 coordinator 管理每个 KV cache group；
3. `BlockPool`维护物理块、空闲队列、引用计数，以及 prefix cache 的 hash → block 映射；
4. model runner 把请求的 block IDs 写入设备 block table，attention backend/kernel 用 block table 和 slot mapping 读写 KV。

源码入口：

- [`vllm/v1/core/kv_cache_manager.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_manager.py)：先读 `KVCacheBlocks`、`allocate_slots()`、`free()`；
- [`vllm/v1/core/block_pool.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/block_pool.py)：看 `BlockPool`、free block queue、引用计数和 cached block hash；
- [`vllm/v1/worker/gpu/block_table.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/worker/gpu/block_table.py)：看 CPU block IDs 如何提交到设备侧 block table，并如何计算 slot mapping；
- [`vllm/v1/attention/ops/paged_attn.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/attention/ops/paged_attn.py)：看 paged KV 的拆分、写入与算子入口；
- [PagedAttention 原论文](https://arxiv.org/abs/2309.06180)：用于理解设计动机与经典算法，不用于断言当前 V1 的所有代码细节。

### 最小例子

设 block size 为 4 个 token。请求 A 已有 7 个 token：

```text
A 的逻辑块: L0=[t0 t1 t2 t3], L1=[t4 t5 t6 _]
A 的块表:   L0 -> 物理块 P7, L1 -> 物理块 P1

物理池（示意）:
P0: B 的块
P1: A.L1
P2: 空闲
P3: C 的块
...
P7: A.L0
```

A 的两个逻辑块在物理显存中不连续，attention 仍可经块表读取它们。第 8 个 token 到来时填入 P1 的最后一个 slot；第 9 个 token 才需要再分配一个任意空闲物理块。相较“先为最大长度 32 预留 8 块”，当前只占 2 块，且尾部只浪费 1 个 slot。

### 常见误解

- **“KV cache 是模型参数的一部分。”** 参数在请求间共享且推理期间通常不变；KV cache 是请求相关的中间状态，随 token 增长并在请求结束后释放或转入可复用缓存。
- **“分页消除了所有碎片。”** 尾块仍有内部碎片；混合 attention、不同 KV cache group 和对齐约束也会让实际布局比经典论文更复杂。
- **“block table 存的是 KV 数据。”** 它存逻辑块到物理 block ID 的映射；大体量 K/V 张量在预分配的设备缓存池中。
- **“PagedAttention、prefix caching、KV offloading 是一件事。”** 分页是寻址与分配基础；prefix caching 决定哪些已算块可复用；offloading/connector 决定 KV 是否跨设备或跨实例搬运。它们可组合，但职责不同。
- **“官方 Paged Attention 设计页就是当前实现说明。”** vLLM 的该页已明确标为历史文档；读概念可以用，追当前实现应回到上述 V1 路径与具体 attention backend。

## 3. Prefill 与 decode：两种工作负载，一套统一调度表示

### 是什么

**Prefill**处理 prompt 中尚未计算的多个 token，建立各层 KV cache，并产生首个可采样位置。它能把许多 token 作为较大的矩阵运算处理，通常更偏 compute-bound。

**Decode**在已有 KV cache 上逐步生成后续 token。普通自回归 decode 每轮每个请求通常只推进一个 token，却要反复读取模型权重和不断增长的 KV cache，通常更偏 memory-bandwidth-bound。

这里说的是模型执行的两种计算形态，不等于 V1 scheduler 内存在两套互斥“阶段状态机”。

### 为何存在：同一请求的计算强度会突变

若长 prompt 一次占满本轮 token budget，已经进入 decode 的请求会等待，ITL 产生尖峰；若永远只照顾 decode，等待中的 prompt 又可能迟迟拿不到首 token。推理服务必须在 TTFT、ITL、吞吐和显存之间取舍。

把长 prefill 切成多个 chunk，可以让 compute-bound 的 prompt token 与 memory-bound 的 decode token 共享一轮 batch：先保住 decode 的及时性，再用剩余 token budget 推进 prefill。

### vLLM 具体怎么做

V1 scheduler 使用统一的 token 进度表示：比较请求的 `num_computed_tokens` 与当前已有 token 数，决定本轮补算多少 token。源码特意说明 scheduler 中没有严格分离的 “prefill phase” 和 “decode phase”；同一机制因此能覆盖 chunked prefill、prefix caching 和 speculative decoding。

在 `v0.27.1` 中，chunked prefill 在可用时默认开启。官方优化文档给出的策略是：优先安排待 decode 的请求，再把剩余 `max_num_batched_tokens` 预算给 prefill；装不下的 prefill 自动切块。代码还会受 `max_num_seqs`、KV slots、encoder budget、优先级和投机 token 等条件影响。

源码入口：

- [`Scheduler.schedule()`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/sched/scheduler.py#L439)：先读统一 token budget 的注释，再沿 running 与 waiting 两段循环走；
- [`docs/configuration/optimization.md`](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/configuration/optimization.md)：读 “Chunked Prefill” 对 decode 优先级与 `max_num_batched_tokens` 的说明；
- [`vllm/v1/attention/backends/utils.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/attention/backends/utils.py)：找 `reorder_batch_to_split_decodes_and_prefills()`，观察设备执行层仍会按计算形态重排 batch。

### 最小例子

设本轮 `max_num_batched_tokens=8`，已有两个 decode 请求 D1、D2，各需推进 1 token；另有一个 10-token prompt P 等待 prefill：

```text
轮次 n:   D1=1 + D2=1 + P=6   -> 共 8 token
轮次 n+1: D1=1 + D2=1 + P=4   -> P 完成 prefill，尚余 2 token 预算
```

若不切 P，它可能要独占一轮，或者因为 10 大于预算而无法进入；切块后，D1/D2 保持出 token，P 也持续前进。该例只展示 token budget，真实 trace 还取决于 KV 命中与上述其他约束。

### 常见误解

- **“Prefill 只运行一次。”** prefix miss、chunked prefill、抢占后重算或多模态输入都可能让 prompt 计算跨多轮发生。
- **“Decode 每轮永远恰好一个 token。”** 普通 decode 通常如此；speculative decoding 会让一次调度包含多个候选 token。
- **“V1 没有 prefill/decode phase，所以两者没有差别。”** scheduler 用统一表示不等于算子特征相同；compute-bound 与 memory-bound 的差异仍决定调度和优化。
- **“更大的 `max_num_batched_tokens` 总是更快。”** 更大预算可能改善 prefill/TTFT 或吞吐，也可能让 decode 等更久、损害 ITL；没有脱离模型、硬件和流量形态的单一最优值。

## 4. 调度与抢占：当 token budget 够、KV blocks 不够时怎么办

### 是什么

**Scheduler**每轮选择请求与 token 数；**preemption（抢占）**是在继续当前运行集合会超出 KV cache 容量等约束时，暂停一个或多个请求并回收其资源，让可保留的请求继续前进。

抢占后的状态如何保存有两条经典路径：

- **Recomputation（重算）**：释放被抢占请求的 KV，恢复时从仍可取得的 token 序列重新计算；省搬运与 CPU cache 管理，代价是重复算力和更高端到端延迟。
- **Swapping（换出/换入）**：把 KV 从 GPU 搬到 CPU，恢复时搬回；省重算，代价是 CPU 内存、PCIe/互联带宽、传输延迟和更复杂的状态管理。

### 为何存在：输出长度未知，准入时无法精确承诺未来显存

分页分配降低了浪费，却不能创造无限显存。多个序列持续增长时，下一轮可能没有足够空闲块；优先级请求也可能要求让低优先级请求腾出容量。若调度器只会拒绝新请求或让整个 engine 失败，服务鲁棒性和优先级语义都会很差。

抢占把“本轮资源不足”变成可恢复的调度事件，但频繁抢占会形成 thrashing：刚重算出 KV 又被释放，吞吐与尾延迟都恶化。

### vLLM 具体怎么做

在当前 V1 中，`Scheduler.schedule()`为运行请求调用 `KVCacheManager.allocate_slots()`。若分配失败，它按 scheduling policy 选择较低优先级的运行请求（FCFS 路径取运行集合末尾），调用 `_preempt_request()`：

1. 释放请求的 KV blocks 和 encoder cache；
2. 把状态改为 `PREEMPTED`；
3. 把 `num_computed_tokens` 归零并清理 speculative tokens；
4. 增加抢占计数，并把请求放回 waiting queue 前部；
5. 后续重新准入时重算所需 token/KV。

**版本边界很重要：`v0.27.1` 的 V1 已移除用于请求抢占的 GPU↔CPU KV cache swapping，当前默认路径是 recompute。** 旧 V0 资料中的 swapped queue、`SWAP` mode 适合做历史对照，不应当作当前 V1 主路径。V1 的 KV offloading、KV connector 或 disaggregated prefill/decode 仍可能搬运 KV，但它们不等于旧式的 preemption swapping。

源码入口：

- [`vllm/v1/core/sched/scheduler.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/sched/scheduler.py)：搜索 `allocate_slots`、`Preempt the lowest-priority request`、`_preempt_request()`；
- [`vllm/v1/core/kv_cache_manager.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_manager.py)：看分配失败如何以 `None` 返回，以及 `free()` 怎样归还块；
- [`docs/configuration/optimization.md`](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/configuration/optimization.md)：看 preemption 的运维信号与调参方向；
- [`docs/usage/v1_guide.md`](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/usage/v1_guide.md)：看 V1 与 V0 的功能边界，尤其 GPU↔CPU KV cache swapping 的移除说明。

### 最小例子

```text
物理 KV pool: 共 6 块，A 占 3，B 占 3，空闲 0
下一轮: A 还需要 1 个新块

allocate_slots(A) -> None
选择牺牲者 B
free(B 的 3 块), B.num_computed_tokens = 0, B -> waiting
allocate_slots(A) -> 成功
稍后 B 重新进入，重算其上下文并重建 KV
```

这个例子体现的是 current V1 的 recompute 语义。真实选择还要看 FCFS/priority、当轮已排 token 的回滚、prefix cache、异步调度和 KV connector 状态。

### 常见误解

- **“有 PagedAttention 就不会 OOM/抢占。”** 分页只提高利用率；总 KV 容量仍有限。
- **“抢占等于取消请求。”** 被抢占请求仍在 engine 内，回到 waiting 后可继续；取消则进入终止路径。
- **“重算是从头重新生成答案。”** 它重建模型计算状态/KV；请求已有 token 序列仍是恢复输入的一部分，具体异步输出还受 stale-output 处理约束。
- **“swap 比 recompute 必然更省。”** 二者交换的是计算成本与搬运/存储成本，优劣取决于架构和互联；当前 V1 已选择移除旧式抢占 swap。
- **“看到 KV offloading 就说明 swap mode 回来了。”** offloading/connector 是独立的数据放置或传输机制，不能据此推导 scheduler 使用旧 V0 swap-preemption 状态机。

## 5. 分布式推理入门：TP 切层内张量，PP 切层序列

### 是什么

**Tensor parallelism（TP，张量并行）**把同一层中的权重矩阵或 attention heads 沿某个维度切到多张 GPU。每张卡计算局部结果，再通过 all-reduce、all-gather 等 collective 组合。所有 TP rank 几乎在每一层、每个 token step 都协作完成同一批请求。

**Pipeline parallelism（PP，流水线并行）**把 Transformer 的层序列切成多个 stage：前一 stage 计算一段层，把中间 activation 发给后一 stage。每张卡只保存和执行自己 stage 的层。

两者都属于 model parallel：目标首先是让一个模型实例跨设备放得下并运行，不是像 data parallel 那样复制多个完整模型副本分别接请求。

### 为何存在：模型权重、KV cache 与单卡容量/带宽不匹配

- TP 直接分摊层内大矩阵，能降低单卡权重占用并并行计算，但 collective 通信频繁，通常偏好节点内 NVLink/NVSwitch 等高速互联。
- PP 按层分摊权重，通信主要是 stage 间 activation；它能支持不均匀的层切分，也适合跨节点或缺少高速节点内互联的情形，但会引入 stage 等待、pipeline bubble、负载不均和额外延迟。
- TP/PP 释放出的权重空间可能间接留给更多 KV cache，但增加 GPU 不保证吞吐或延迟线性改善，通信与调度开销会成为新瓶颈。

### vLLM 具体怎么做

vLLM 用 `tensor_parallel_size` 和 `pipeline_parallel_size`建立二维模型并行拓扑。对一个 data-parallel rank，GPU worker 数约为 `TP × PP`。

TP 的层内原语在 `linear.py`：

- `ColumnParallelLinear`沿权重输出维切分，可选择 all-gather 输出；
- `RowParallelLinear`沿权重输入维切分，通常对局部结果做 all-reduce；
- `QKVParallelLinear`沿 attention head 维切 Q/K/V，GQA/MQA 下部分 KV heads 可能复制。

PP 的模型切分在 `make_layers()`：根据当前 PP rank 算出 `start_layer/end_layer`，本 stage 只实例化自己的层，其余位置用 `PPMissingLayer`占位。`parallel_state.py`创建 TP/PP process groups，executor/worker 负责实际跨进程执行。

源码入口：

- [`vllm/distributed/parallel_state.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/distributed/parallel_state.py)：从 `initialize_model_parallel()` 的 8-GPU 示例理解 rank 分组；
- [`vllm/model_executor/layers/linear.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/model_executor/layers/linear.py)：读 `ColumnParallelLinear`、`RowParallelLinear`、`QKVParallelLinear`；
- [`vllm/model_executor/models/utils.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/model_executor/models/utils.py)：读 `PPMissingLayer` 与 `make_layers()`；
- [`vllm/model_executor/models/llama.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/model_executor/models/llama.py)：看一个具体模型怎样同时使用 TP linear 和 PP layer slicing；
- [`docs/serving/parallelism_scaling.md`](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/serving/parallelism_scaling.md)：看单机/多机配置示例与互联取舍。

### 最小例子

一台或多台机器共有 8 张 GPU，配置 `TP=4, PP=2`：

```text
PP stage 0: g0 g1 g2 g3  -> 前半 Transformer layers
              \-- TP=4：每层矩阵/heads 切 4 份 --/

PP stage 1: g4 g5 g6 g7  -> 后半 Transformer layers
              \-- TP=4：每层矩阵/heads 切 4 份 --/

PP 通信: g0->g4, g1->g5, g2->g6, g3->g7（概念示意）
总 worker 数: 4 × 2 = 8
```

请求先在 stage 0 完成前半层，再把 activation 送到 stage 1。每个 stage 内，四个 TP rank 共同完成该 stage 的每一层。

### 常见误解

- **“TP=4、PP=2 一共只用 6 张卡。”** 它们构成二维拓扑，通常是 `4 × 2 = 8` 张 worker GPU（未计 data parallel 复制）。
- **“TP 把请求平均分给四张卡。”** 那更像 data parallel；TP 是四张卡共同算同一个请求/批次的层内分片。
- **“PP 只是把权重文件拆开加载。”** 它还改变前向执行图，需要 stage 间传 activation，并处理 pipeline 时序。
- **“跨节点 TP 与节点内 TP 成本一样。”** TP collective 对互联带宽和延迟很敏感；官方文档因此强调高带宽互联，实际选择必须结合硬件拓扑。
- **“模型能放下就说明并行策略最优。”** 放得下只是容量门；还要看 collective、pipeline bubble、stage 平衡、KV 容量和目标 TTFT/ITL。

## 概念 → vLLM 模块：建议的带码学习路径

按下面顺序读，前一步会为后一步建立数据结构和控制流：

| 顺序 | 概念问题 | 先读模块 / 符号 | 带着什么问题读 |
| --- | --- | --- | --- |
| 1 | 一轮是谁发起的？ | `vllm/v1/engine/core.py` | 请求从加入到 `schedule → execute → update` 的主循环在哪里？ |
| 2 | continuous batch 如何形成？ | `vllm/v1/core/sched/scheduler.py::schedule` | `running`/`waiting` 如何变化？token budget 在哪里扣减？完成请求何时释放？ |
| 3 | prefill/decode 如何共用调度器？ | `Scheduler.schedule`；`docs/configuration/optimization.md` | `num_computed_tokens` 如何统一表达两种工作？长 prefill 在哪里被截成 chunk？ |
| 4 | scheduler 怎样申请 KV？ | `vllm/v1/core/kv_cache_manager.py::allocate_slots` | “本轮 token 数”如何换算成新 blocks？何时返回分配失败？ |
| 5 | 物理 blocks 怎样复用？ | `vllm/v1/core/block_pool.py::BlockPool` | free queue、ref count、block hash 分别解决什么问题？ |
| 6 | 块表怎样进入 GPU？ | `vllm/v1/worker/gpu/block_table.py`；`gpu_model_runner.py` | request 的 block IDs 如何变成 device block table 与 slot mapping？ |
| 7 | attention 怎样消费分页 KV？ | `vllm/v1/attention/ops/paged_attn.py`，再进入所用 backend | query 如何通过 block table 读取离散 K/V？当前硬件实际选了哪个 backend？ |
| 8 | KV 不够时怎样恢复？ | `Scheduler._preempt_request`；`KVCacheManager.free` | 哪个请求被选中？哪些计数被重置？为何下一次会重算？ |
| 9 | 一层如何跨 GPU？ | `distributed/parallel_state.py`；`layers/linear.py` | TP/PP groups 怎样组成？column/row parallel 各需要什么 collective？ |
| 10 | 一个模型怎样接入 TP/PP？ | `models/utils.py::make_layers`；`models/llama.py` | 哪些层只属于当前 PP stage？QKV、O projection、MLP 分别怎样 TP？ |

一个有效的读码练习是手工追踪单个 request ID：从 `SchedulerOutput.num_scheduled_tokens`，到 `req_to_new_blocks`，再到 model runner 的 block table/slot mapping，最后回到 `update_from_output()`。这条链能把“调度决定”“内存分配”“设备执行”三个层次连起来。

## 证据边界、失效条件与最少复核

### 已核验的一手来源

- vLLM 官方发布版 [`v0.27.1`](https://github.com/vllm-project/vllm/releases/tag/v0.27.1) 的源码与仓内文档：支持本文对 V1 scheduler、KV cache manager、recompute preemption、TP/PP 和代码位置的描述。
- Kwon 等人的 [PagedAttention / vLLM SOSP 2023 论文](https://arxiv.org/abs/2309.06180)：支持分页 KV 的原始问题、逻辑/物理块表、碎片分析与经典设计；论文中的 V0-era 实现不能覆盖当前 V1 行为。

### 本文没有证明什么

- 没有 GPU 环境，未运行吞吐、TTFT、ITL、显存占用或抢占频率实验；因此不对任何硬件给出“最佳”参数。
- compute-bound / memory-bound 是官方优化文档对典型 prefill/decode 的分类，不表示所有模型、序列长度和 kernel 下都绝对成立。
- 源码位置与默认策略是版本敏感事实；本文不是跨版本不变的 API 契约。

### 失效条件

出现任一情况时，应重新核验本文中对应部分：

- vLLM 升级后 V1 scheduler、KV cache manager 或 worker 目录重构；
- 官方重新引入 request-preemption swapping，或改变 recompute 默认语义；
- `Scheduler.schedule()` 不再使用统一 token budget / `num_computed_tokens` 模型；
- 目标模型使用 hybrid attention、Mamba、KV connector、disaggregated serving 或特殊硬件 plugin，使经典 full-attention 路径不再代表实际执行；
- 部署拓扑或 attention backend 改变，需要据实际 collective 与 kernel 重新判断瓶颈。

### 下次最少复核步骤

1. 查看 vLLM 最新稳定 release，并固定一个 tag；
2. 在该 tag 检查本文学习路径中的文件仍存在；
3. 在 `Scheduler.schedule()`复核统一 token budget、running/waiting 次序和 `allocate_slots()`调用；
4. 在 `_preempt_request()`复核是否仍释放 blocks、重置 `num_computed_tokens`并回到 waiting；
5. 在 `docs/usage/v1_guide.md` 与 `docs/configuration/optimization.md`复核 swapping、recompute 和 chunked prefill 的当前说明；
6. 根据实际 GPU/backend 再做性能实验，概念学习阶段不要把未测参数写成结论。

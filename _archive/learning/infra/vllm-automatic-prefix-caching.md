# 复用相同前缀：vLLM Automatic Prefix Caching

<!-- markdownlint-disable MD013 -->

> 适用对象：已经理解 KV cache、prefill 和 vLLM 物理块，希望判断重复长前缀怎样跳过计算的后端工程师。
> 核验基线：vLLM [`v0.27.1`](https://github.com/vllm-project/vllm/releases/tag/v0.27.1)，核验于 2026-08-12。
> 证据等级：机制与代码位置由该版本官方文档和源码核验；未启动模型、GPU 或线上流量实验。
> 教学范围：主流程、例题和检查限定在单 KV cache group／非 hybrid 的 block-aligned 本地 APC；“完整物理块”是这一范围内的教学口径，不是覆盖 hybrid partial hit 的全版本不变量。

这是关联 [#166（个人学习与 KB 内容）](https://github.com/Eridanus117/agent-control/issues/166)的 B2 增量单元。关联 [#170（vLLM 学习单元）](https://github.com/Eridanus117/agent-control/issues/170)已经说明 KV cache、PagedAttention、block pool、prefill/decode 和 scheduler；本文只补它点到但没有展开的 Automatic Prefix Caching（APC）：新请求怎样找到先前请求留下的**相同 token 前缀**，复用已有 K/V，并把剩余部分交回普通调度路径。

关联 [#199（vLLM serving 请求生命周期）](https://github.com/Eridanus117/agent-control/issues/199)解释 HTTP 请求怎样进出 EngineCore；本文从请求进入 scheduler 后开始，不重复 HTTP、SSE 或中止传播。学完后，应能：

1. 给定 token 序列和 block size，算出最长可复用前缀；
2. 沿 `hash → lookup → touch → allocate → free/evict` 追踪块生命周期；
3. 判断 APC 何时改善 prefill／TTFT，何时几乎没有收益；
4. 区分 APC、PagedAttention、语义缓存和跨实例 KV 搬运；
5. 用命中指标、cache salt 与版本边界检查一次部署。

## 先建立最小模型

```text
请求 1 的 prompt tokens
  │ 按 block size 切成完整块
  ▼
链式 block hash
  │ parent hash + 当前块 token IDs + extra keys
  ▼
hash → 物理 KV block 的缓存映射
  │ 请求完成后，ref_cnt 可归零；块进入可驱逐队列但仍可命中
  ▼
请求 2 到达：从第 0 块起连续查找
  │ 命中的块 touch 并绑定给请求 2
  │ 第一个 miss 之后按普通 prefill 计算
  ▼
scheduler 只为未命中后缀分配 slots 与计算预算
```

APC 复用的是**已经计算出的 K/V 块**，不是最终回答，也不是 prompt 文本本身。命中后，模型仍需对未命中的 prompt 后缀做 prefill，并照常逐 token decode 新输出。

## 1. 什么才算“相同前缀”

匹配对象是模型实际收到的 token IDs，从第一个 token 开始连续匹配。两段文字看起来相同，不代表它们经过 chat template、tokenizer、LoRA、多模态处理和请求隔离后一定得到同一个 cache key。

设 `block_size = 4`：

```text
请求 A: [a b c d] [e f g h] [i j]
请求 B: [a b c d] [e f g h] [x y z]
请求 C: [q r s t] [e f g h] [x y]
```

- A 完成后，前两个完整块可以进入 prefix cache；尾部 `[i j]` 不满一块，不能作为普通完整块命中。
- B 从 token 0 开始与 A 相同，因此前 8 个 token 可命中；`[x y z]` 仍要计算。
- C 的第二块字面上也是 `[e f g h]`，但它的父前缀不同，所以链式 hash 不同，不能从中间开始借用 A 的第二块。

这解释了“prefix”而不是“任意公共子串”：Transformer 的某个 token K/V 依赖它前面的上下文；相同局部 token 放在不同前缀后面，不是同一个可复用状态。

官方功能文档给出的两个典型工作负载是：多次提问同一份长文档，以及多轮对话不断携带同一段历史。两者都让昂贵的公共部分出现在 prompt 开头，且新回答通常比公共 prompt 短。

## 2. 为什么用链式 block hash，而不是维护一棵 prompt 树

vLLM V1 对每个完整块计算：

```text
block_hash = H(parent_block_hash, block_token_ids, extra_keys)
```

其中：

- `parent_block_hash` 把此前全部完整块的上下文压进当前 key；
- `block_token_ids` 防止只靠父 hash 把不同当前块混在一起；
- `extra_keys` 纳入会改变模型状态或隔离边界的 LoRA、多模态输入 hash、prompt embeddings 与 `cache_salt`。

因此，缓存映射可以直接做 `hash → KVCacheBlock` 查找，不需要把请求组织成常驻树结构。请求追加 token 时只为新形成的完整块继续链式计算 hash；已有 hash 可以复用。

在 `v0.27.1` 中，默认算法为 `sha256`。它使用 Pickle 序列化，不能承诺跨 Python 或 vLLM 版本稳定；需要跨环境可复现 key 时，官方提供基于 canonical CBOR 的 `sha256_cbor`。非加密的 `xxhash` 变体更快，但碰撞会带来未定义行为和多租户信息泄漏风险，不能只按吞吐选择。

源码入口：

- [`kv_cache_utils.py::generate_block_hash_extra_keys`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_utils.py#L560-L593)；
- [`kv_cache_utils.py::hash_block_tokens`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_utils.py#L596-L623)；
- [`kv_cache_utils.py::get_request_block_hasher`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_utils.py#L691-L748)；
- [`CacheConfig` 的默认开关与 hash 算法](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/config/cache.py#L44-L100)。

## 3. 新请求怎样命中并进入 scheduler

等待中的新请求第一次被调度时，scheduler 在普通 slot 分配前查询本地 prefix cache：

1. `KVCacheManager.get_computed_blocks()`检查该请求是否允许读 prefix cache；
2. coordinator 按请求的链式 block hashes，从左到右找最长连续命中；
3. 返回命中的物理块和已计算 token 数；
4. scheduler 把本地命中计入 `num_computed_tokens`，只为剩余 prompt 与本轮输出安排计算；
5. `allocate_slots()`对命中块增加引用并为未命中部分申请新块。

```text
request.num_computed_tokens == 0
  │
  ├─ get_computed_blocks(request)
  │    └─ find_longest_cache_hit(block_hashes)
  │          ├─ hit: 返回完整块与 token 数
  │          └─ miss: 在首个不连续处停止
  │
  ├─ 计算 num_new_tokens = prompt 剩余 + 本轮 decode/其他预算
  └─ allocate_slots(hit blocks, new tokens)
       ├─ touch 命中块，避免其在本轮被驱逐
       └─ 从 free queue 取新块
```

### “全部命中”为什么仍会算一点

源码把最大本地命中长度限制为 `request.num_tokens - 1`，因为 engine 仍需用最后一个 token 取得下一 token logits。当前 slot 分配还要求已计算 token 数按 block 对齐，所以“只差最后一个 token”有时会表现为重算最后一个完整块。这不是 cache miss 的语义变化，而是当前实现的 logits 与对齐边界。

源码入口：

- [`scheduler.py` 的本地命中入口](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/sched/scheduler.py#L739-L852)；
- [`KVCacheManager.get_computed_blocks`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_manager.py#L229-L295)；
- [`KVCacheManager.allocate_slots`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_manager.py#L344-L460)。

## 4. 命中块为什么不会被别的请求同时“抢走”

`BlockPool`预先拥有固定数量的物理 `KVCacheBlock`。每块包含不可变 `block_id`、可被设置或清除的 hash、当前引用计数，以及 free queue 链接。

当请求命中一个 ref count 为 0 的缓存块时，`touch()`会先把它从 free queue 移除，再增加引用计数。它因此不再是当前可分配／可驱逐候选；多个请求也可以通过引用计数共同使用同一块。

当需要新块时，`get_new_blocks()`从 free queue 头部取块。如果取出的块仍有 cache hash，就先从 hash 映射中驱逐旧身份，再把物理块交给新内容。换言之：

- **cache hit**复用现有物理块；
- **eviction**只让旧 hash 不再可命中，并允许同一个 block ID 被新内容覆盖；
- **allocation**没有额外创建无限增长的 KV 内存。

源码入口：

- [`BlockPool.get_cached_block`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/block_pool.py#L198-L223)；
- [`BlockPool.get_new_blocks` 与驱逐](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/block_pool.py#L647-L700)；
- [`BlockPool.touch`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/block_pool.py#L702-L717)。

## 5. 请求结束后，缓存为何还能复用

请求结束时，“释放”有两层含义：

1. 该请求不再持有块，块的 `ref_cnt` 递减；
2. ref count 归零的块回到 free queue，成为将来可分配和可驱逐的候选。

对于带 hash 的完整块，回到 free queue **不等于立即删除 cache key**。它仍可被后来请求查到；若命中，`touch()`把它从队列拿回。只有 block pool 需要这个物理块承载新内容时，旧 hash 才被驱逐。

vLLM 把无 hash、永远不能命中 APC 的块放到更早的驱逐位置，把带 hash 的块追加到队列尾部；同一请求释放时，文档还让较深、包含更多前缀的块更早被驱逐，因为越长的完整前缀通常越不容易再次匹配。整体效果接近以复用机会为目标的 LRU，而不是“请求结束就清空”。

源码入口：

- [`BlockPool.cache_full_blocks`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/block_pool.py#L225-L299)；
- [`BlockPool.free_blocks`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/block_pool.py#L719-L742)；
- [官方 prefix caching 设计文档的 Free 与 Eviction](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/design/prefix_caching.md#free)。

## 6. Worked example：三条请求共享与分叉

设 block size 为 4，pool 中已有足够块：

```text
R1 prompt: [S0 S1 S2 S3] [D0 D1 D2 D3] [Q1]
R2 prompt: [S0 S1 S2 S3] [D0 D1 D2 D3] [Q2 A B]
R3 prompt: [S0 S1 S2 S3] [X0 X1 X2 X3] [D0 D1 D2 D3]
```

### R1 首次运行

1. 没有 hash 命中，整个 prompt 做 prefill；
2. 第一块 hash 为 `H(None, S0..S3, extras)`；
3. 第二块 hash 为 `H(hash1, D0..D3, extras)`；
4. `[Q1]`不满一块，不形成普通完整块 key；
5. R1 完成后，前两块 ref count 归零并进入 free queue，但 hash 映射保留。

### R2 到达

1. 第一块 hash 命中；
2. 第二块的父 hash 与 token IDs 也一致，继续命中；
3. 命中长度为 8 tokens；
4. scheduler 只计算 `[Q2 A B]`以及后续 decode；
5. 两个命中块被 touch，在 R2 使用期间不参与驱逐。

### R3 到达

1. 第一块命中；
2. 第二块 `[X0..X3]`与 R1 不同，出现首个 miss；
3. 查找在这里停止；即使 R3 第三块字面等于 R1 第二块，它也不能作为连续前缀命中；
4. scheduler 复用 4 tokens，计算后面的 8 tokens。

在本文单 KV cache group／非 hybrid 的范围内，这个例子同时检验三条不变量：只命中完整物理块、只命中从 token 0 开始的连续前缀、当前块身份包含父 hash。

## 7. 何时有收益，何时没有

### 高价值形状

- 多个请求共享长 system prompt、长文档或代码仓上下文；
- 多轮对话把历史放在开头，只在末尾追加新一轮；
- 公共前缀远长于新问题和生成答案；
- 请求落到能看见同一 block pool 的 engine 实例；
- chat template、tokenizer、模型／LoRA 与隔离 key 稳定。

### 低价值或无命中形状

- 大部分时间耗在长 decode，而不是 prompt prefill；
- 每个请求开头都不同，只在中间含相似内容；
- 应用在公共内容前插入动态时间戳、随机 ID 或不同 system message；
- 相同语义被改写为不同 token 序列；
- 负载均衡把后续请求送到没有共享 KV 的其他实例，且未部署外部 KV connector；
- cache 压力让可复用块在下次请求前已经被驱逐。

APC 的直接收益上限主要落在 prefill 计算与 TTFT；它不会缩短必须生成的 decode token 数，也不能保证整体请求延迟按命中比例线性下降。

## 8. 配置、观测与多租户隔离

### 配置事实

在 `v0.27.1` 的 engine 参数解析中，受支持的非 hybrid 模型默认启用 prefix caching；hybrid 模型暂时保持 opt-in。为了让部署意图可审查，仍可显式使用 `--enable-prefix-caching`，离线 `LLM(...)`则可传 `enable_prefix_caching=True`。实际默认值应以目标模型和该版本解析结果为准，不只看旧教程。

hash 算法通过 `--prefix-caching-hash-algo`选择。跨版本／跨语言复现 key 与单实例本地复用是两个需求：前者优先考虑 `sha256_cbor`，后者仍要结合实际 CPU hash 成本测量。

源码入口：[`EngineArgs` 的默认解析](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/engine/arg_utils.py#L2598-L2642)。

### 观测

V1 暴露两个按 token 计数的 Prometheus counter：

- `vllm:prefix_cache_queries`：参与本地 prefix cache 查询的 token 数；
- `vllm:prefix_cache_hits`：实际由本地 cache 命中的 token 数。

可在同一时间窗计算 `hits / queries`，但不要把它单独当性能结论。至少同时看 prompt 长度分布、TTFT、请求排队、KV usage 和生成长度：高 hit rate 可能被长 decode 掩盖，低 hit rate 也可能在少量超长 prompt 上节省大量计算。

源码入口：[`vllm/v1/metrics/loggers.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/metrics/loggers.py#L584-L601)。

### 隔离

共享 cache 会产生时序侧信道：攻击者可能用命中后的延迟变化推断某段前缀是否曾被处理。`cache_salt`只加入第一个 block 的 extra keys，后续链式 hash 会继承该隔离；只有持有相同 salt 的请求才能互相复用。多租户部署应按信任组分配不可猜测 salt，并同时保留访问控制、日志与模型数据边界；salt 不是完整安全方案。

## 9. 常见误解

- **“PagedAttention 就是 prefix caching。”** PagedAttention／block table 解决离散 K/V 的放置与寻址；APC 决定哪些已计算块能被后续请求复用。前者提供基础，后者是独立策略。
- **“相同文本片段都能命中。”** 只复用从 token 0 开始、经过同一模板和 extra keys 的连续前缀；在本文限定的单 KV cache group／非 hybrid 路径中，命中边界按完整物理块对齐。它不是子串缓存。
- **“语义相同就会命中。”** APC 做精确 token-prefix 复用，不做 embedding 检索、语义匹配或答案缓存。
- **“请求结束后 KV 释放，所以不可能再命中。”** 请求引用被释放；带 hash 的零引用块仍留在可驱逐队列和映射中，直到被重用或驱逐。
- **“命中 80% 就让端到端延迟降 80%。”** 命中只跳过相应 prefill 计算；排队、后缀 prefill、decode、网络与客户端消费仍存在。
- **“跨实例自动共享。”** 本地 APC 命中同一个 block pool；跨实例复用需要 KV connector 或其他明确的数据路径，不能由相同 hash 自发完成。
- **“hash 相同就一定安全共享。”** 还要考虑碰撞算法、LoRA／多模态 key、cache salt 与租户信任边界。

## 10. 独立微任务与 teach-back

### 微任务

给定 block size 为 4、相同 model/tokenizer/LoRA/salt，以及已经处理完成的：

```text
P0 = [A B C D] [E F G H] [I J K L] [M]
```

分别回答新请求的本地命中 token 数，并画出 `lookup → touch → allocate → free/evict`：

```text
P1 = [A B C D] [E F G H] [I J X Y]
P2 = [A B C D] [Q R S T] [I J K L]
P3 = [A B C D] [E F G H] [I J K L] [M]
```

核对要点：P1 命中 8；P2 命中 4，第三块不能跨过第二块 miss；P3 不应机械回答“13 全命中”，还要说明当前实现为取得 logits 会保留最后 token 的计算，并受 block 对齐影响。三者命中块都先 touch，结束后引用归零回到可驱逐队列；只有实际重分配物理块时旧 hash 才被驱逐。

### Teach-back

用 90 秒向熟悉 Redis LRU、但没读过 LLM KV cache 的工程师解释：“为什么 vLLM 能在不维护 prompt 树的情况下复用长前缀？”必须包含链式 hash、本文范围内的完整物理块、引用计数／free queue、首个 miss 停止和 prefill-only 收益边界。

## 证据边界、失效条件与最少复核

### `v0.27.1` 的 hybrid partial-hit 边界

本文主流程把 hash 粒度与物理 KV block 粒度对齐，因而例题中的命中边界都是完整物理块。这一结论不能无条件外推到 hybrid 路径：

- [`CacheConfig.prefix_match_unit`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/config/cache.py#L56-L66) 定义 prefix-cache 命中的最细 token 边界，并说明它等于 KV cache 代码中的 `hash_block_size`；只要每个 KV cache group 的物理 `block_size` 都能被它整除，该粒度就可以小于物理块，使命中边界落在物理块内部。
- [hybrid coordinator 的 partial-hit 路径](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/core/kv_cache_coordinator.py#L554-L598) 保存 `hash_block_size`，验证各 group 的物理块为其整数倍，并在无 context parallelism 的 full-attention＋Mamba `align` 布局中开启 partial hash hit；此时命中对齐用 `hash_block_size`，否则才用 scheduler block size。

因此，本文保留单 KV cache group／非 hybrid 下的例题和块对齐检查，但把 hybrid partial hit 明确列为版本边界；需要教学或部署 hybrid 模型时，必须另行核对各 group 的物理 `block_size`、`prefix_match_unit`／`hash_block_size` 与 coordinator 对齐规则。

### 找到并复用的当前结论

- 关联 [#170（vLLM 学习单元）](https://github.com/Eridanus117/agent-control/issues/170)固定的“KV cache 是请求相关的动态状态；block pool 管理物理块；prefill 与 decode 的成本形状不同”继续适用于同一 `v0.27.1`，本文只补 prefix reuse 生命周期。
- 关联 [#174（Route B 教学系统采纳）](https://github.com/Eridanus117/agent-control/issues/174)的当前规则要求概念结构、教学资产和学习者状态分离；因此本文保持厚叙事，新节点只保存门控合同，learner state 只登记 `unseen`。

### 本次增量核验

- [vLLM `v0.27.1` APC 功能文档](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/features/automatic_prefix_caching.md)：核验使用方式、适配负载与 prefill-only 限制；
- [vLLM `v0.27.1` prefix caching 设计文档](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/design/prefix_caching.md)：核验 hash key、完整块、数据结构、分配、释放与驱逐；
- 同版本 `scheduler.py`、`kv_cache_manager.py`、`block_pool.py`、`kv_cache_utils.py`、`arg_utils.py`、`cache.py`、`kv_cache_coordinator.py` 与 metrics logger：核验当前调用路径、默认配置、hybrid partial-hit 边界、隔离 key 与观测名称；
- 本次通过 GitHub API 直接读取固定 tag；没有采用博客、论坛或搜索摘要作为行为证据。

### 本文没有证明什么

- 未运行 GPU 或目标模型，因而没有证明特定 workload 的 TTFT、吞吐、hash CPU 开销、驱逐曲线或端到端收益；
- 没有覆盖 hybrid attention、Mamba、sliding window、KV connector、disaggregated prefill、跨实例 external cache 或多模态 partial hit 的完整算法；
- 没有把官方“通常近似免费”的表述提升为所有部署都无回归；真实收益仍取决于 prompt 复用、块压力和 decode 占比；
- 这是负责人学习资产，不因写入 `learning/` 自动升级为公共当前知识、样本有效或产品采用证据。

### 失效条件

出现任一情况时，先把受影响段落与节点检查标为待复核：

- vLLM 升级后 block hash 组成、默认算法、完整块限制或 all-hit logits 边界变化；
- scheduler 不再经 `get_computed_blocks → allocate_slots` 接入本地命中；
- block pool 的引用、free queue 或驱逐策略改变；
- hybrid／sliding-window 模型成为本次目标，多个 KV cache group 的求交规则影响命中边界；
- 部署改用外部 KV connector、跨实例 cache 或不同租户隔离策略；
- metrics 名称、计数单位或默认开关改变。

### 下次最少复核步骤

1. 固定目标 vLLM release tag 与模型类型；
2. 核对 `CacheConfig` 和 `EngineArgs` 的默认 prefix caching 与 hash 算法；
3. 核对 `generate_block_hash_extra_keys()`与 `hash_block_tokens()`的 key 组成；
4. 核对 scheduler 的 `get_computed_blocks()`入口、all-hit 上限与 `allocate_slots()`参数；
5. 核对 block pool 的 lookup、touch、free 与 eviction 顺序；
6. 核对 Prometheus 指标名称和 token 计数语义；
7. 在目标部署用一组“长公共前缀＋不同短问题”和一组“等长但不同前缀”做对照，记录 hit tokens、TTFT、吞吐、KV usage 与生成长度，再形成环境限定的性能结论。

# 学习者状态（vLLM 教学试点）

<!-- markdownlint-disable MD013 -->

更新时间：2026-08-12T23:20:14-04:00

## 教学运行调参

负责人于 2026-08-12 补充确认：每轮体感应以“学到新东西”为主，而不是以“被复检”为主。

- 当时问题：首轮虽完成即时门控，但问答和纠错占比过高，完整教学展开不足，整体体验偏复检。
- 根因判断：把“先测后教”机械执行为新节点的主结构，并因学习者已有后端基础而过早压缩讲解；门控手段挤占了教学目标。
- 被替代做法：新节点以 check 开场、依据初答零散补缺的做法，不再作为默认流程。
- 下轮起的默认配比：开场先问可用时间；到期旧概念闭卷复测控制在 5 分钟内；主体用于一个新节点，依次给出最小模型（一张图、一个类比或一个对比）、完整 worked example 逐步走、缺步练习，最后才做该节点 check。
- 调整边界：检查、teach-back 和 `provisional`／`retained` 门控不取消；只有负责人自报“会了”时才压缩讲解。
- 验收信号：下一轮应先出现充分的新知识教学，再出现检查；复习段不超过 5 分钟，且新节点门控证据仍完整。

## 节点状态

| 节点 | stage | nextReview |
| --- | --- | --- |
| `vllm.autoregressive-loop` | provisional | 下次会话开场闭卷复测（不早于 2026-08-13） |
| `vllm.kv-cache-purpose` | learning | 下次会话继续：先纠正新增／释放边界，再完成门控 |
| `vllm.prefill-workload` | unseen | — |
| `vllm.decode-workload` | unseen | — |
| `vllm.latency-metrics` | unseen | — |
| `vllm.kv-fragmentation` | unseen | — |
| `vllm.logical-physical-blocks` | unseen | — |
| `vllm.block-table-slot-mapping` | unseen | — |
| `vllm.paged-attention` | unseen | — |
| `vllm.continuous-batching` | unseen | — |
| `vllm.scheduler-control-loop` | unseen | — |
| `vllm.token-budget-chunked-prefill` | unseen | — |
| `vllm.kv-slot-allocation` | unseen | — |
| `vllm.preemption-recompute` | unseen | — |
| `vllm.tensor-parallelism` | unseen | — |
| `vllm.pipeline-parallelism` | unseen | — |
| `vllm.tp-pp-topology` | unseen | — |
| `vllm.serving-request-lifecycle` | unseen | — |
| `vllm.automatic-prefix-caching` | unseen | — |

## 学习证据

### `vllm.autoregressive-loop`

- 时间：2026-08-12T09:32:35-04:00
- 题目：3-token prompt 生成 2 个 token，画出模型执行轮次，并标出 prefill/decode、输入与历史。
- 初答要点：正确识别先 prefill、后逐 token decode；一度把未来 token 的 Q 当作当前输出的来源，并把“生成 2 个 token”计作 prefill 后 2 次 decode。
- 纠正后答案要点：prefill 输入整个 prompt、缓存 prompt KV 并产生首个输出；下一轮 decode 输入刚生成的 token，读取此前历史 KV、追加本轮 token KV并产生下一个输出。独立完成了 4-token prompt 生成 3-token 的三轮 trace。
- teach-back 要点：能说明生成 token 存在顺序依赖；经反馈纠正 tokenizer/embedding/QKV/attention/LM head 的顺序，并区分 decode 开始前已有 KV 与本轮新增 KV。
- 相邻辨析与新情境应用：能说明一个 batch 只是多个请求的本轮共同执行，不代表请求完整生命周期；对 A 生成 2 token、B 生成 3 token 的动态 batch，正确给出 `A+B`、`A+B`、`B`，共 3 次模型执行。
- 支持级别：中等；使用直接纠错、完整示例、缺步题和独立微任务。初始 check 为 1/2，纠正后的独立 trace 与迁移题达到 2/2。
- 判定：无资料解释、相邻辨析和新情境应用均通过，记为 `provisional`；尚无延迟保持证据，不能记为 `retained`。

### `vllm.kv-cache-purpose`

- 时间：2026-08-12T10:05:57-04:00
- 时间盒：5 分钟。
- 教学内容：用“每条请求的历史注意力索引”建立最小模型；完整走过 prompt `a,b,c` 后连续生成 `d,e` 的 KV 读写；对比了请求相关、动态增长的 KV cache 与跨请求共享、基本固定的模型参数；说明了无缓存时旧前缀逐层计算会重复发生。
- 缺步练习：对已有 `KV[a,b,c]`、decode 输入 `d`，正确回答新计算 `Qd,Kd,Vd`、读取 `KV[a,b,c]`、追加 `KV[d]`。
- check 答案要点：正确回答缓存内容、无缓存时的重复计算，以及 KV 与模型参数的动态／固定区别；混淆了输出 token 何时进入缓存，并误以为单轮 decode 后释放，评分 1/2。
- 最小纠正：明确 KV 跟随“本轮实际输入模型的 token”增长；请求完成前 `KV[a,b,c,d]` 包含输入 `d` 而不含刚采样的最终 `e`，随后释放该请求的全部 KV。迁移追问中正确回答：若下一轮输入 `e`，缓存变为 `KV[a,b,c,d,e]`。
- 支持级别：中等；使用最小模型、完整 worked example、缺步练习、闭卷 check 和直接纠错。
- 判定：记为 `learning`。闭卷 check 尚未独立通过，且本轮未完成 teach-back、相邻辨析与新情境门控；不得记为 `provisional`。

## 教材勘误候选

- 暂无。

## 路线扩展记录

- 2026-08-12：关联 [#166（个人学习与 KB 内容）](https://github.com/Eridanus117/agent-control/issues/166)的自然学习需求新增 `vllm.serving-request-lifecycle`；这里只登记 `unseen`，没有新增学习会话或掌握证据，也不改变 `vllm.kv-cache-purpose` 的既有下一步。
- 2026-08-12：关联 [#166（个人学习与 KB 内容）](https://github.com/Eridanus117/agent-control/issues/166)的 B2 后续单元新增 `vllm.automatic-prefix-caching`；这里只登记 `unseen`，没有新增学习会话或掌握证据，也不改变 `vllm.kv-cache-purpose` 的既有下一步。

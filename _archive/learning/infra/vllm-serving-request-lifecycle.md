# 从 HTTP 请求到 SSE：vLLM serving 请求生命周期

<!-- markdownlint-disable MD013 -->

> 适用对象：已经理解自回归生成基本轮次、希望把后端请求处理经验映射到大模型推理服务的工程师。
> 核验基线：vLLM [`v0.27.1`](https://github.com/vllm-project/vllm/releases/tag/v0.27.1)，核验于 2026-08-12。
> 证据等级：本文行为均由该版本官方文档或源码核验；未启动模型、HTTP 服务或 GPU 性能实验。

这是关联 [#166（个人学习与 KB 内容）](https://github.com/Eridanus117/agent-control/issues/166)的 B2 增量单元。关联 [#170（vLLM 学习单元）](https://github.com/Eridanus117/agent-control/issues/170)已经解释 scheduler、continuous batching、KV cache、prefill/decode 与模型并行；本文补上它明确没有展开的 serving 层：一条 `POST /v1/chat/completions` 怎样从 HTTP handler 进入独立 EngineCore，再把 token 变成流式事件返回客户端。

学完后，应能沿一个 request ID 解释四个问题：谁把聊天消息渲染成模型输入、谁把请求加入 scheduler、谁把 token ID 变回文本、客户端断开后谁负责中止仍在运行的请求。

## 先建立一张端到端图

```text
HTTP client
  │ POST /v1/chat/completions
  ▼
FastAPI route
  │ 校验 JSON，选择 Chat serving handler
  ▼
OpenAIServingChat + OnlineRenderer
  │ chat template / tokenize / sampling params / request ID
  ▼
AsyncLLM（API 进程）
  │ 先登记 OutputProcessor 状态与每请求 collector
  │ 再经 AsyncMPClient 发送 EngineCoreRequest
  ▼
EngineCore（独立进程）
  │ Scheduler.schedule → ModelExecutor.execute_model
  │                    → Scheduler.update_from_output
  ▼
EngineCoreOutputs
  │ 经进程间通道返回 API 进程
  ▼
OutputProcessor → 每请求 collector → AsyncLLM.generate
  │ detokenize / stop check / RequestOutput
  ▼
Chat response formatter
  │ stream=true: SSE data chunks
  │ stream=false: 等最终结果后 JSON
  ▼
HTTP client
```

最重要的边界是：**HTTP handler 不直接执行 GPU 模型。** 在线 serving 前端与 EngineCore 通过异步、多进程客户端相连；前端负责协议、渲染和按请求路由结果，EngineCore 负责调度与模型执行。

## 1. 启动时：先把前端和 EngineCore 接起来

`vllm serve` 启动 OpenAI-compatible server 时，`api_server.py` 先从命令行参数建立 engine config，再创建 `AsyncLLM`。FastAPI app 的 state 保存同一个 `engine_client`、模型表、renderer 和不同 API 的 serving handler；HTTP 请求到来时不重新加载模型。

在线 `AsyncLLM` 使用 `EngineCoreClient.make_async_mp_client()`。普通单 data-parallel rank 路径得到 `AsyncMPClient`；data parallel 可能选择其他 client 子类。因此“一台 API server 永远对应一个 EngineCore”不是跨部署形态不变量，但**API 前端通过 EngineCoreClient 推送请求、拉取输出**是本版本的稳定阅读入口。

源码入口：

- [`api_server.py::build_async_engine_client_from_engine_args`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/api_server.py#L141-L180)：建立 `AsyncLLM`；
- [`api_server.py::init_app_state`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/api_server.py#L355-L460)：把 engine、renderer 与 serving 对象装进 app state；
- [`core_client.py::EngineCoreClient`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core_client.py#L78-L139)：区分 in-process、同步多进程和异步多进程客户端；
- [`core_client.py::MPClient`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core_client.py#L503-L514)：说明请求和输出经独立进程边界流动。

### 后端工程师可迁移的模型

可以把 API 进程看成“协议适配器 + 异步请求多路复用器”，把 EngineCore 看成“有自己事件循环的计算服务”。二者不是普通的 controller → service 同进程调用：请求已被 HTTP handler 接收，不代表 scheduler 已准入，更不代表 GPU 已开始执行。

## 2. 入站：从 JSON 到可调度请求

### HTTP route 只做协议入口

`/v1/chat/completions` route 先让 FastAPI/Pydantic 解析请求并执行 JSON 校验，再从 app state 取得 `OpenAIServingChat`。handler 可能返回三种结果：

- `ErrorResponse` → 带相应状态码的 JSON；
- 完整 `ChatCompletionResponse` → 一次性 JSON；
- 异步生成器 → `text/event-stream` 的 `StreamingResponse`。

源码入口：[`chat_completion/api_router.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/chat_completion/api_router.py#L40-L74)。

### Renderer 把聊天协议降成 engine input

`OpenAIServingChat.render_chat_request()`先检查模型和 engine 健康，再调用 `OnlineRenderer.render_chat()`。renderer 负责 chat template、tokenization 和多模态预处理等前端工作，产出 `EngineInput`；serving 层随后生成 request ID、计算允许的最大输出长度，并把 OpenAI 请求参数转换成 sampling params。

只有完成这些步骤，serving handler 才调用 `engine_client.generate(...)`。因此下面几类失败发生在请求进入 scheduler 以前：

- JSON 或字段形状不合法；
- 请求的模型或 adapter 不可用；
- chat template / tokenization / multimodal preprocessing 失败；
- prompt 加输出上限超过模型上下文边界；
- engine 已经被前端判定为不可用。

源码入口：[`chat_completion/serving.py`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/chat_completion/serving.py#L192-L217) 与[请求生成器构建段](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/chat_completion/serving.py#L235-L377)。

## 3. 入队：先准备回程地址，再把请求发给 EngineCore

`AsyncLLM.generate()`不是执行模型的函数；它是每条请求的异步结果生成器。第一次迭代时，它调用 `add_request()`：

1. `InputProcessor`把 renderer 的输入与 sampling params 转成 `EngineCoreRequest`；
2. 启动共享的后台 `output_handler`（若尚未启动）；
3. 为本请求建立 `RequestOutputCollector`；
4. 先在 `OutputProcessor`登记请求状态、detokenizer 与 collector；
5. 再调用 `EngineCoreClient.add_request_async()`把请求发送到 EngineCore。

“先登记输出状态，再跨进程发请求”很关键：前端必须先知道未来输出属于谁，才能安全接住 EngineCore 很快返回的首批结果。这个因果解释是根据源码顺序作出的推断；源码直接证明的是登记与发送的先后顺序。

异步多进程客户端给消息编码后通过 ZMQ socket 发送 `ADD` 类型；EngineCore 收到后预处理请求并调用 `scheduler.add_request()`。至此，请求才进入调度域。

源码入口：

- [`async_llm.py::add_request`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/async_llm.py#L283-L432)；
- [`core_client.py::add_request_async`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core_client.py#L1093-L1152)；
- [`core.py::EngineCore.add_request`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core.py#L439-L491)。

## 4. 执行：一个 HTTP 请求被拆成许多 engine step

EngineCore 的一次 `step()`执行三段控制流：

```text
Scheduler.schedule()
  → ModelExecutor.execute_model(scheduler_output)
  → Scheduler.update_from_output(scheduler_output, model_output)
```

这正是关联 [#170（vLLM 学习单元）](https://github.com/Eridanus117/agent-control/issues/170)中的 continuous batching 主循环。多个 HTTP 请求进入同一个调度域后，会按 token budget、sequence 上限、KV slots 与其他约束共同组成每轮设备工作。某个请求的 `stream=true` 不会赋予它独立 GPU 循环，也不会让 scheduler 为每个 SSE 事件单独运行一次模型。

源码入口：[`core.py::EngineCore.step`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core.py#L584-L614)。

### 两种“异步”不要混淆

- **前端异步**：API 进程可以同时等待很多请求的输出，不阻塞整个 HTTP event loop；
- **设备并行／组批**：scheduler 决定哪些请求的哪些 token 进入本轮模型执行。

前者使许多连接可并发挂起，后者决定 GPU 做什么。`async def` 本身不产生 GPU 并行或 continuous batching。

## 5. 回程：token ID 怎样变成 SSE

`AsyncLLM` 只有一个共享后台 `output_handler` 从 EngineCore client 拉取批量输出。它把批量结果交给 `OutputProcessor.process_outputs()`；后者按 request ID 找回前端状态，然后：

1. 更新每请求指标；
2. 增量 detokenize 新 token IDs；
3. 执行 stop-string 检查并更新 logprobs；
4. 建立 `RequestOutput`；
5. 把结果放入该请求自己的 collector。

对应请求的 `AsyncLLM.generate()`正在等待这个 collector；取到结果后向 serving handler `yield`。因此 EngineCore 输出是按 batch 回来的，而 HTTP 返回是由前端按 request ID 拆回每条连接的。

源码入口：

- [`async_llm.py::_run_output_handler`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/async_llm.py#L657-L711)；
- [`output_processor.py::process_outputs`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/output_processor.py#L589-L708)；
- [`async_llm.py::generate`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/async_llm.py#L544-L615)。

### `stream=true` 与 `stream=false`

- `stream=true`：chat streaming generator 逐个消费 `RequestOutput`，把新增文本、tool/reasoning 解析结果、结束原因和可选 usage 变成 SSE `data:` 事件，最终发送终止事件；
- `stream=false`：full generator 仍消费同一个 engine result generator，只是等到最终结果后组装一个 `ChatCompletionResponse`。

二者共享渲染、入队、scheduler、模型执行和 OutputProcessor；差异主要在输出聚合与 HTTP 表达。一个 SSE chunk 也不保证恰好对应一个 token 或一个 engine step：stream interval、增量 detokenization、stop-string、tool/reasoning parser 都可能改变事件边界。

源码入口：[`chat_completion_stream_generator`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/chat_completion/serving.py#L422-L490) 与 [`chat_completion_full_generator`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/chat_completion/serving.py#L843-L918)。

## 6. 取消：客户端断开不会自动杀死整个 engine

route 上的 `with_cancellation` 同时等待 handler 与 HTTP disconnect。若在返回 response 以前客户端断开，handler task 被取消；若已经返回 `StreamingResponse`，由 response 自己监听断开。

取消最终传播到 `AsyncLLM.generate()`时，它捕获 `CancelledError` 或生成器退出，调用 `abort()`：

1. `OutputProcessor`移除本请求的前端状态并生成中止结果；
2. EngineCore client 发送 `ABORT`；
3. EngineCore 让 scheduler 把对应请求标记为已中止；
4. 若并发中的旧输出稍后抵达，OutputProcessor 发现本地状态已不存在，直接忽略。

所以取消对象是**请求**，不是 API 进程、EngineCore 进程或同一 batch 中的其他请求。

源码入口：

- [`api_utils.py::with_cancellation`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/serve/utils/api_utils.py#L37-L94)；
- [`async_llm.py::generate` 取消段](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/async_llm.py#L608-L615)；
- [`output_processor.py::abort_requests`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/output_processor.py#L462-L523)；
- [`core.py::abort_requests`](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/core.py#L485-L491)。

## 7. Worked example：两条请求共享 engine，不共享响应

设 A 是流式请求，B 是非流式请求；二者几乎同时到达：

```text
A: request_id=chatcmpl-A, stream=true, 还需 3 次 decode
B: request_id=chatcmpl-B, stream=false, 还需 2 次 decode

t0  API 前端分别 render A、B，并分别建立 collector
t1  EngineCore scheduler 选 [A, B]
t2  输出批次含 A1、B1；OutputProcessor 按 request ID 分流
    A 的 handler -> SSE delta A1
    B 的 handler -> 保存中间 RequestOutput，不返回最终 JSON
t3  scheduler 再选 [A, B]
t4  输出 A2、B2(完成)
    A -> SSE delta A2
    B -> 完整 JSON，HTTP 请求完成
t5  scheduler 只选 [A]
t6  输出 A3(完成) -> SSE delta + finish reason + 终止事件
```

现在改一个条件：A 在 `t2` 后断开。前端取消 A 的 generator 并发送 abort；B 继续完成。若 A 的某个已在途输出稍后抵达，因为 A 的前端状态已经移除，它不会被错送给 B。

这个例子说明三种隔离同时存在：

- HTTP 连接按请求隔离；
- 前端 collector 按 request ID 隔离；
- EngineCore 可以把不同请求组在同一 model step 中执行。

## 8. 排障时从哪一层开始

| 症状 | 第一检查层 | 先问什么 |
| --- | --- | --- |
| 立即 4xx | route / renderer | JSON、模型名、chat template、上下文长度是否在入队前失败？ |
| request 已接收但迟迟无首 token | frontend → EngineCore → scheduler | 请求是否已发送？在 waiting 还是 running？token/KV 预算是否阻塞？ |
| EngineCore 有输出但客户端没增量 | OutputProcessor / chat formatter / HTTP | request ID 是否仍在？detokenize、parser、stream interval 或连接是否阻塞？ |
| 客户端断开后显存迟迟不释放 | cancellation / abort / scheduler | 取消是否传播到 generator？ABORT 是否到达 EngineCore？请求是否仍在 scheduler？ |
| 一个请求失败后其他请求也停 | engine health / shared output handler | 是单请求协议错误，还是共享 EngineCore/output handler 已进入错误态？ |

这张表只帮助定位责任边界，不替代 metrics、trace 或实际部署日志。特别是 TTFT/ITL 的根因仍可能在队列、GPU 执行、网络或客户端消费速度，不能只凭 HTTP 表象下结论。

## 9. 常见误解

- **“FastAPI handler 调一次模型函数就得到答案。”** handler 建立异步生成器；模型执行在独立 EngineCore 的多轮 step 中发生。
- **“`stream=true` 就是 continuous batching。”** streaming 是响应传输语义；continuous batching 是 EngineCore 调度语义。
- **“一个 SSE event 就是一个 token。”** 事件边界还受 detokenization、stream interval 与 parser 影响。
- **“API 是异步的，所以 GPU 自然并行。”** 前端并发与设备执行计划是两套机制。
- **“客户端断开会停掉同一个 batch。”** abort 只指向相关 request IDs，其他请求继续。
- **“外部 request ID 在所有内部结构中永远原样使用。”** AsyncLLM 会维护 external → internal ID 映射，parallel sampling 还会产生父子请求；排障时应确认正在看的 ID 层次。
- **“收到 HTTP 200 说明 engine 一定健康到请求结束。”** 流式响应可能在真正生成完成前就返回成功状态；后续 engine/parser 错误仍需通过 stream 错误事件或日志观察。

## 10. 独立微任务与 teach-back

### 微任务

闭卷画出一条 `stream=true` 请求的六个关键点，并在图上标出：

1. chat template/tokenization 在哪里；
2. per-request collector 在发送 EngineCoreRequest 前还是后建立；
3. scheduler 与 GPU 执行在哪个进程边界之后；
4. token ID 在哪里变回文本；
5. SSE 在哪里形成；
6. 客户端断开怎样到达 scheduler 的中止路径。

### 核对要点

完整答案应包含：`FastAPI route → OpenAIServingChat/OnlineRenderer → AsyncLLM/OutputProcessor registration → EngineCoreClient → EngineCore scheduler/executor → OutputProcessor/detokenizer → chat SSE formatter`，并说明取消从 HTTP task 传播到 `AsyncLLM.generate()`、再经 `ABORT` 进入 scheduler。

### Teach-back

用 90 秒向一位熟悉普通异步 Web 服务、但没读过 vLLM 的后端工程师解释：“为什么一个 HTTP 请求既有自己的异步 generator，又会和其他请求共享同一次 GPU model step？”必须给出一个请求取消但另一个继续的边界例子。

## 证据边界、失效条件与最少复核

### 找到并复用的当前结论

- 关联 [#170（vLLM 学习单元）](https://github.com/Eridanus117/agent-control/issues/170)中“自回归请求跨多轮、scheduler 每轮形成动态 batch、EngineCore 执行 `schedule → execute → update`”仍以同一 `v0.27.1` 为基线，直接复用；本文没有重做 KV、PagedAttention 或 scheduler 算法调研。
- Route B 采用“概念结构、教学资产、学习者状态分离；薄图厚资产”的当前规则，因此本文是叙事资产，独立节点负责门控，学习者状态只记录实际证据。

### 本次增量核验

- [vLLM `v0.27.1` OpenAI-compatible server 文档](https://github.com/vllm-project/vllm/blob/v0.27.1/docs/serving/online_serving/openai_compatible_server.md)：核验对外入口与支持的 HTTP API；
- 同版本 `api_server.py`、chat route/serving、`async_llm.py`、`core_client.py`、`core.py` 与 `output_processor.py`：核验入站、跨进程调度、回程、流式格式化和取消路径；
- 本次通过 GitHub API 直接读取固定 tag；没有采用博客、教程或搜索摘要作为行为证据。

### 本文没有证明什么

- 未运行模型或发起 HTTP 请求，因而没有证明特定部署的吞吐、TTFT、ITL、网络背压或故障恢复表现；
- 没有覆盖 Responses API、batch API、pooling、多模态细节、parallel sampling、data-parallel load balancing、disaggregated serving、tool/reasoning parser 的完整状态机；
- 本文解释默认的单服务阅读路径，不把具体进程数、socket 拓扑或类名当成跨版本公共 API；
- 这是负责人学习资产，不因写入 `learning/` 自动升级为公共当前知识或产品采用证据。

### 失效条件

出现任一情况时，先把受影响段落标为待复核：

- vLLM 升级后 OpenAI route、renderer、`AsyncLLM`、EngineCore client 或 OutputProcessor 目录重构；
- 在线 serving 改为 in-process EngineCore，或进程间传输不再经过当前 client 抽象；
- request admission、output routing 或 cancellation 不再沿本文所列方法；
- 部署启用多 API server、data parallel、disaggregated rendering/inference 或其他拓扑，使一对一示意不再代表实际进程关系；
- stream interval、tool/reasoning parser 或协议实现改变了 SSE 事件边界。

### 下次最少复核步骤

1. 固定新的稳定 release tag；
2. 在 OpenAI route 确认 `/v1/chat/completions` 仍调用相应 serving handler；
3. 在 chat serving 中确认 renderer、`engine_client.generate()` 与 stream/full 两条返回路径；
4. 在 `AsyncLLM.add_request()`确认前端状态登记与 EngineCore 发送的顺序；
5. 在 EngineCore client 与 `EngineCore.step()`确认进程边界及 `schedule → execute → update`；
6. 在 OutputProcessor 与 cancellation wrapper 确认按 request ID 回程和 abort 传播；
7. 对目标部署实际跑一条流式、一条非流式和一条中途断开请求，再把性能或恢复结论限制在该环境。

# Serving 请求生命周期

<!-- markdownlint-disable MD013 -->

## id

`vllm.serving-request-lifecycle`

## outcome

面对一条 Chat Completions trace，能沿 request ID 追踪 renderer、AsyncLLM、EngineCore、OutputProcessor 与 SSE 的往返路径，并判断客户端断开应在哪些边界传播中止。

## requires

- `vllm.autoregressive-loop`

## contrastsWith

- `vllm.continuous-batching`：前者描述一条请求跨协议与进程的端到端生命周期；后者描述 EngineCore 每轮怎样重组设备工作，两者不是同一层。
- `transport-streaming`：SSE 事件边界属于 HTTP 输出语义，不等于一个 token 或一个 model step。

## assets

- [关联 #166（个人学习与 KB 内容）：vLLM serving 请求生命周期叙事资产](../../../infra/vllm-serving-request-lifecycle.md)
- [vLLM `v0.27.1` Chat Completions route](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/entrypoints/openai/chat_completion/api_router.py#L40-L74)
- [vLLM `v0.27.1` AsyncLLM 请求与回程](https://github.com/vllm-project/vllm/blob/v0.27.1/vllm/v1/engine/async_llm.py#L544-L711)

## checks

**1（应用）**：给定“请求 A 为 `stream=true`，已经收到两个 SSE delta 后客户端断开；同一 engine 中请求 B 仍在运行”的 trace，闭卷画出 A 从 HTTP route 到 EngineCore、再回到 SSE 的路径，并指出中止如何传播、B 为何不应被中止。评分：2 分＝正确标出 renderer、AsyncLLM/collector、EngineCore scheduler、OutputProcessor/SSE 和 A-only abort；1 分＝主路径正确但混淆 streaming 与调度或遗漏中止边界；0 分＝认为 handler 直接执行 GPU，或断开 A 会终止整个 batch/engine。

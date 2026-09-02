# vLLM v0.27.1 CPU 本地可观察环境

<!-- markdownlint-disable MD013 -->

本文记录 2026-08-14 在 WSL Ubuntu 24.04 上完成的真实运行。环境位于 `/home/morni/venvs/vllm-cpu-0271`，只使用 vLLM 官方发布的 `v0.27.1` CPU wheel；没有使用 `sudo`、`apt`、系统 Python、全局 pip、GPU 依赖或源码编译。

完整 DEBUG 样本见 [`samples/vllm-cpu-opt-125m-debug.log`](./samples/vllm-cpu-opt-125m-debug.log)，共 337 行。下文行号均按 `\n` 计数并固定到这份样本，可在本目录用 `sed -n '<N>p' samples/vllm-cpu-opt-125m-debug.log` 复现。

## 环境与隔离安装

实测前提：WSL `x86_64`、16 核、约 23 GiB 内存，`/proc/cpuinfo` 同时含 `avx2` 与 `avx512f`；WSL 系统 Python 为 3.12.3，`uv` 为 0.11.27。`uv venv --python 3.12` 实际选择了隔离的 CPython 3.12.13，不修改系统 Python。

在 WSL 中运行：

```bash
VENV="$HOME/venvs/vllm-cpu-0271"
WHEEL="https://github.com/vllm-project/vllm/releases/download/v0.27.1/vllm-0.27.1+cpu-cp38-abi3-manylinux_2_34_x86_64.whl"

mkdir -p "$HOME/venvs"
uv venv --python 3.12 "$VENV"
uv pip install \
  --python "$VENV/bin/python" \
  --torch-backend cpu \
  "$WHEEL"

"$VENV/bin/python" -c \
  'import torch, vllm; print(vllm.__version__); print(torch.__version__)'
```

实测输出为 `vllm 0.27.1`、`torch 2.13.0+cpu`。从开始建 venv 到 150 个包安装完成，外部墙钟为 **182.1 秒**；其中依赖解析约 118 秒、下载与准备约 62 秒、安装约 0.3 秒。`uv` 的下载列表虽含 `triton`，但 PyTorch 和相关媒体包均明确为 `+cpu`，本次没有 CUDA/ROCm/XPU runtime。

## 验证 wheel 自带 tcmalloc

安装完成后先运行这条失败门；如果看不到 `libtcmalloc`，不要执行推理、不要自行运行 `apt` 或请求 `sudo`，应把负事实交回负责人处理。

```bash
VENV="$HOME/venvs/vllm-cpu-0271"
"$VENV/bin/python" -c '
import pathlib
import vllm

libs = pathlib.Path(vllm.__file__).parent / "libs"
print(libs)
for path in sorted(libs.iterdir()):
    print(path.name, path.stat().st_size)
'
```

本机实测目录为 `/home/morni/venvs/vllm-cpu-0271/lib/python3.12/site-packages/vllm/libs/`，内容只有：

```text
libtcmalloc_minimal.so.4 163240
```

这修正了要求先用 `apt` 安装 `libtcmalloc-minimal4`、再手工设置 `LD_PRELOAD` 的旧 CPU 文档路径。vLLM v0.27.1 的 `CpuPlatform.check_and_update_config()` 会在配置初始化时自动把 wheel 内的 tcmalloc 和 PyTorch 自带的 libgomp 加到 `LD_PRELOAD`，且已有同类库时不重复追加。

## 运行一次可观察请求

下面的命令将 KV cache 限为 1 GiB，把 EngineCore 留在当前进程以汇总一份完整日志，并显式打开逐 iteration 细节。它适合教学观察，不是生产性能配置。先从仓库根目录把 `REPO` 改成当前 worktree 在 WSL 下的实际路径。

```bash
VENV="$HOME/venvs/vllm-cpu-0271"
REPO="/mnt/c/Users/Morni/orca/workspaces/agent-control/f277a-vllm-cpu"
LOG="$REPO/learning/teaching/pilot-vllm/samples/vllm-cpu-opt-125m-debug.log"

VLLM_LOGGING_LEVEL=DEBUG \
VLLM_CPU_KVCACHE_SPACE=1 \
VLLM_ENABLE_V1_MULTIPROCESSING=0 \
OMP_NUM_THREADS=8 \
"$VENV/bin/python" - <<'PY' >"$LOG" 2>&1
import os
import time

print(f"OBSERVE_LD_PRELOAD_BEFORE={os.environ.get('LD_PRELOAD')}", flush=True)

from vllm import LLM, SamplingParams
from vllm.platforms import current_platform

print(
    f"OBSERVE_PLATFORM_AFTER_IMPORT={current_platform.__class__.__name__}",
    flush=True,
)
t0 = time.monotonic()
llm = LLM(
    model="facebook/opt-125m",
    dtype="float32",
    max_model_len=128,
    max_num_seqs=1,
    enforce_eager=True,
    disable_log_stats=False,
    enable_logging_iteration_details=True,
)
print(f"OBSERVE_ENGINE_INIT_SECONDS={time.monotonic() - t0:.3f}", flush=True)
print(f"OBSERVE_LD_PRELOAD_AFTER_INIT={os.environ.get('LD_PRELOAD')}", flush=True)

t1 = time.monotonic()
outputs = llm.generate(
    ["The capital of France is"],
    SamplingParams(temperature=0, max_tokens=4),
)
print(f"OBSERVE_REQUEST_SECONDS={time.monotonic() - t1:.3f}", flush=True)
print(f"OBSERVE_REQUEST_ID={outputs[0].request_id}", flush=True)
print(f"OBSERVE_FINISH_REASON={outputs[0].outputs[0].finish_reason}", flush=True)
print(f"OBSERVE_OUTPUT={outputs[0].outputs[0].text!s}", flush=True)
PY
```

首次运行会从 Hugging Face 下载 `facebook/opt-125m`。本机下载后的模型缓存目录为 `$HOME/.cache/huggingface/hub/models--facebook--opt-125m`，`du -sb` 实测 **251,899,620 字节**（`du -sh` 为 **241M**）。首次冷缓存引擎初始化为 80.869 秒；最终逐 iteration 样本使用热模型缓存，引擎初始化为 24.739 秒。最终样本中单次 `generate()` 请求墙钟为 **0.200 秒**，请求 ID 为 `0`，结束原因为 `length`，实际输出为 ` the capital of the`。

运行时的 `LD_PRELOAD` 在初始化前为 `None`，初始化后实测为：

```text
/home/morni/venvs/vllm-cpu-0271/lib/python3.12/site-packages/vllm/libs/libtcmalloc_minimal.so.4:/home/morni/venvs/vllm-cpu-0271/lib/python3.12/site-packages/torch/lib/libgomp.so.1
```

这是推理进程中用 `os.environ.get("LD_PRELOAD")` 取得的运行时值；命令没有手工设置它。

## CPU 日志为什么仍出现 GPU 字样

> **判读提示：这份运行仍是纯 CPU。** 第 17、21 行分别确认自动探测为 `cpu` 和类名为 `CpuPlatform`，第 51 行的引擎配置也明确写有 `device_config=cpu`。

日志里的 `GPU KV cache size`、`num_gpu_blocks`、`GPU KV cache usage` 和源码路径 `gpu_model_runner.py` 是 CPU wheel 与其他平台共用的指标字段名或实现路径名，不是 GPU 探测结果，也不表示安装或调用了 GPU runtime。学习这些日志时应先用平台探测和 `device_config` 判定实际设备，再把上述 `GPU` 字样理解为历史沿用的通用命名；否则很容易把 CPU 上真实发生的 KV cache 分配和调度误判成 GPU 执行。

## 五项观察锚点

| 现象 | 结果与固定日志锚点 |
| --- | --- |
| ① 平台探测 | **观察到**。第 17 行：`Automatically detected platform cpu.`；第 21 行：`OBSERVE_PLATFORM_AFTER_IMPORT=CpuPlatform`。不是 `UnspecifiedPlatform`。第 13、16 行还记录 AMD Zen 检测后因未安装 zentorch 回退到 `CpuPlatform`。 |
| ② KV cache 块数与内存预算 | **观察到**。第 283 行：`Explicitly set (1.0/23.03) GiB for KV cache on node 0.`；第 284 行：`GPU KV cache size: 14,464 tokens`；第 285 行：`Maximum concurrency for 128 tokens per request: 113.00x`；第 288 行：`num_gpu_blocks is: 113`。这些共享字段名的判读见上一节；14,464 tokens ÷ 113 blocks = 128 tokens/block。 |
| ③ 调度器循环的批次决策 | **观察到**。第 320 行的 `Iteration(0)` 调度 `1 context requests, 6 context tokens`；第 323、326、329 行的 `Iteration(1..3)` 各调度 `1 generation requests, 1 generation tokens`。相邻第 318、321、324、327 行的 `BatchDescriptor` 分别为 6、1、1、1 token。 |
| ④ prefill 与 decode 分界 | **观察到**。第 320 行以 `context requests/context tokens` 明确标出 6-token prefill；第 323 行首次转为 `generation requests/generation tokens`，随后第 326、329 行继续逐 token decode。分界在 iteration 0 与 1 之间。 |
| ⑤ 请求完整生命周期起止 | **观察到**。第 314 行 `Rendering prompts: 0%` 是这次调用进入请求渲染的可见起点；第 320 行进入首个调度 iteration；第 331–333 行显示 `Processed prompts: 100%`；第 334–337 行依次记录 0.200 秒、request ID `0`、`length` 结束和最终输出。vLLM 的逐 iteration 行本身不打印 request ID，所以脚本在返回边界补印 ID 和结束原因。 |

## 预期特征与已知坑

- 必须传 `enable_logging_iteration_details=True`；只开 `VLLM_LOGGING_LEVEL=DEBUG` 会看到 `BatchDescriptor`，但不会出现能直接区分 context/prefill 与 generation/decode 的 `Iteration(...)` 行。
- 遇到 CPU 日志里的 `GPU` 字样时，按前述判读提示交叉核对第 17、21、51 行，不凭字段名猜测实际设备。
- `facebook/opt-125m` 没有 chat template。DEBUG 日志会记录 `processor_config.json`/`preprocessor_config.json` 的 404 和 `tokenizer.chat_template is not set`，随后明确写 `This model does not support chat template`；本样本直接用文本 prompt，推理仍成功，这些不是请求失败。
- Hugging Face 未配置 token 时会打印匿名请求限速警告；本次公开模型下载成功。若后续因限速失败，应保留完整日志后重试或配置合法凭据，不改用其他模型冒充本合同。
- `VLLM_ENABLE_V1_MULTIPROCESSING=0` 只为把 EngineCore 和观测标记收在同一日志流中；它不改变模型、调度算法或 CPU wheel，但墙钟数据不能外推为生产吞吐基准。
- 这次没有安装 zentorch。AMD Zen 的平台插件两次打印“zentorch not installed, falling back to CpuPlatform”，是预期且可用的 CPU 路径。

## 成功复核

```bash
grep -nE \
  'OBSERVE_|Automatically detected platform|KV cache|cache_config_info|Iteration\(|Running batch' \
  "$LOG"
```

复核应同时看到 `CpuPlatform`、113 个 cache blocks、prefill 的 6 context tokens、三个 decode iteration、request ID/finish reason，以及自动形成且同时含 `libtcmalloc_minimal.so.4` 与 `libgomp.so.1` 的 `LD_PRELOAD`。
